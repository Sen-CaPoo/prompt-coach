import type { EngineInterface } from 'claude-code'

/**
 * The three ways a review is asked for. Each resolves a result and never
 * throws: a review that fails must leave the prompt to go out as typed.
 */
export type ReviewReply =
  | { isOk: true; text: string; via: string; cache?: string }
  | { isOk: false; reason: string }

const MAX_TOKENS = 4000

function timeoutAfter($: EngineInterface, ms: number): { expired: Promise<'timeout'>; cancel: () => void } {
  let cancel = () => {}
  const expired = new Promise<'timeout'>(resolve => {
    const timer = $.clock.after(ms, () => resolve('timeout'))
    cancel = () => timer.cancel()
  })

  return { expired, cancel }
}

/**
 * True when the session reaches its model through a gateway or a cloud
 * provider. There a fork that names its own effort level writes the whole
 * conversation to the prompt cache again, so the fork names none.
 */
export async function isBehindGateway($: EngineInterface): Promise<boolean> {
  const baseUrl = await $.env.get('ANTHROPIC_BASE_URL')
  if (baseUrl !== undefined && baseUrl !== '' && !/^https:\/\/api\.anthropic\.com\/?$/.test(baseUrl)) {
    return true
  }
  const bedrock = await $.env.get('CLAUDE_CODE_USE_BEDROCK')
  const vertex = await $.env.get('CLAUDE_CODE_USE_VERTEX')
  const foundry = await $.env.get('CLAUDE_CODE_USE_FOUNDRY')

  return [bedrock, vertex, foundry].some(flag => flag !== undefined && flag !== '' && flag !== '0')
}

/**
 * Asks the session's own model, with the whole conversation in view. Resolves
 * 'nothing-to-fork' before the session's first request and after a resume.
 */
export async function reviewByFork(
  $: EngineInterface,
  ask: string,
  isEffortNamed: boolean,
  timeoutMs: number,
): Promise<ReviewReply | 'nothing-to-fork'> {
  const timer = timeoutAfter($, timeoutMs)
  try {
    const reply = await Promise.race([
      $.model.fork(isEffortNamed ? { prompt: ask, effort: 'low' } : { prompt: ask }),
      timer.expired,
    ])
    if (reply === 'timeout') {
      return { isOk: false, reason: 'timeout' }
    }
    if (reply.isAnswered) {
      // How much of the conversation the prompt cache served, and how much had to be written.
      const cache = `read ${reply.usage.cache_read_input_tokens} write ${reply.usage.cache_creation_input_tokens} in ${reply.usage.input_tokens} out ${reply.usage.output_tokens}`

      return { isOk: true, text: reply.text, via: 'fork', cache }
    }
    if (reply.reason === 'nothing-to-fork') {
      return 'nothing-to-fork'
    }

    return { isOk: false, reason: reply.reason }
  } catch (error) {
    return { isOk: false, reason: String(error).slice(0, 80) }
  } finally {
    timer.cancel()
  }
}

/** Asks a model through the session's credentials, with no conversation behind it. */
export async function reviewByComplete(
  $: EngineInterface,
  request: { model: string; system: string; prompt: string },
  timeoutMs: number,
): Promise<ReviewReply> {
  try {
    const reply = await $.model.complete({
      model: request.model,
      system: [{ text: request.system, cache: true }],
      prompt: request.prompt,
      effort: 'low',
      maxTokens: MAX_TOKENS,
      timeoutMs,
    })
    if (reply.isAnswered) {
      return { isOk: true, text: reply.text, via: `complete:${request.model}` }
    }

    return { isOk: false, reason: reply.reason === 'aborted' ? 'timeout' : reply.reason }
  } catch (error) {
    return { isOk: false, reason: String(error).slice(0, 80) }
  }
}

type ApiMessage = {
  stop_reason?: string
  content?: readonly { type?: string; text?: string }[]
  error?: { type?: string; message?: string }
}

/** Asks the Messages API with the person's own key. */
export async function reviewByApi(
  $: EngineInterface,
  request: { baseUrl: string; apiKey: string; model: string; system: string; prompt: string },
  timeoutMs: number,
): Promise<ReviewReply> {
  const timer = timeoutAfter($, timeoutMs)
  const post = (isEffortSent: boolean) =>
    $.http.fetch(`${request.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': '2026-10-21',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.prompt }],
        ...(isEffortSent ? { output_config: { effort: 'low' } } : {}),
      }),
    })
  try {
    let response = await Promise.race([post(true), timer.expired])
    // An older model takes no effort setting and answers 400: ask again without it.
    if (response !== 'timeout' && response.status === 400) {
      response = await Promise.race([post(false), timer.expired])
    }
    if (response === 'timeout') {
      return { isOk: false, reason: 'timeout' }
    }
    let message: ApiMessage
    try {
      message = JSON.parse(response.text) as ApiMessage
    } catch {
      return { isOk: false, reason: `api ${response.status}` }
    }
    if (!response.ok) {
      return { isOk: false, reason: `api ${response.status} ${message.error?.type ?? ''}`.trim() }
    }
    // A safety classifier can decline a request with a 200: there is no text to read then.
    if (message.stop_reason === 'refusal') {
      return { isOk: false, reason: 'refusal' }
    }
    const text = (message.content ?? [])
      .filter(block => block.type === 'text' && typeof block.text === 'string')
      .map(block => block.text)
      .join('')
    if (text === '') {
      return { isOk: false, reason: 'empty-reply' }
    }

    return { isOk: true, text, via: `api:${request.model}` }
  } catch (error) {
    return { isOk: false, reason: String(error).slice(0, 80) }
  } finally {
    timer.cancel()
  }
}
