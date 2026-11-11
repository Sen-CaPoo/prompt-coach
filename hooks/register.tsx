import type { EngineInterface, Register } from 'claude-code'

import { resolveProfile, resolveReviewModel } from '../rules/index'
import type { ModelProfile } from '../rules/index'
import type { Override } from '../types'
import { cardLines, cardRows, drawCard, primaryAction } from './lib/card'
import type { Decision, Held } from './lib/card'
import { isBehindGateway, reviewByApi, reviewByComplete, reviewByFork } from './lib/engine'
import type { ReviewReply } from './lib/engine'
import { autoRewriteBlock, haystackOf, judgeRewrite, verifiedAdditions } from './lib/guard'
import { lintPrompt } from './lib/lint'
import { parseReview } from './lib/parse'
import { forkRequest, standaloneRequest, viewOf } from './lib/request'
import { scoreOf } from './lib/score'
import { applyCommandWord, readSettings } from './lib/settings'
import { configText, refusalText, stringsFor } from './lib/strings'
import type { Strings } from './lib/strings'
import type { Addition, Effort, LintHit, Outcome, PromptView, Row, Settings } from './lib/types'
import { pause } from './lib/wait'

// Prompt Coach: reviews each prompt the person sends, before the turn starts,
// against Anthropic's prompting guidance for the session's model and effort.
//
// prompt.submit   review, then by mode: hold the prompt and show a card (coach),
//                 or attach notes / replace the text without asking (auto).
// turn.step       remembers the effort of the session's last request.
// ui.render       draws the card in a pane, or in the band above the prompt.
// command.run     /prompt-coach switches mode for the session and reports.
// config.describe names this plugin's /config rows in the interface language.
//
// Every failure lets the prompt through as typed.

const PANE = 'prompt-coach'
const COMMAND = 'prompt-coach'
const HOLD_LIMIT_MS = 10 * 60 * 1000
/** How long "the next prompt goes through" stands after the draft was put back to edit. */
const EDIT_PASS_MS = 10 * 60 * 1000
const EFFORTS: readonly string[] = ['low', 'medium', 'high', 'xhigh', 'max']
/** What `/prompt-coach` switched, in the session's state: it outlives a reload of this module. */
const OVERRIDE = { plugin: 'prompt-coach', key: 'override' } as const
/** This plugin's `/config` rows: `prompt-coach.<field>`. */
const CONFIG_ROW = /^prompt-coach\.(.+)$/

let options: Settings = readSettings(undefined)
/** The model and effort of the session's last request. */
let seen: { model: string; effort: Effort | undefined } | undefined
let held: Held | null = null
let last: Outcome | null = null
/** One prompt at a time: set from the moment a review starts until its prompt is sent or dropped. */
let isBusy = false
/** After "put it back to edit": until this time, the next prompt typed goes through unreviewed. */
let passNextUntil = 0
/** After a cancel: the same text sent again goes through unreviewed. */
let cancelledText: string | null = null
let isGateway: boolean | undefined

type Submission = {
  settings: Settings
  view: PromptView
  lint: LintHit[]
  profile: ModelProfile
  model: string
  effort: Effort
  isEffortAssumed: boolean
  rows: Row[]
}

/** The options, with what `/prompt-coach` switched for this session laid over them. */
async function currentSettings($: EngineInterface): Promise<Settings> {
  const { value } = await $.state.get(OVERRIDE)

  return value ? { ...options, mode: value.mode, autoStyle: value.autoStyle } : options
}

/** A tool call's input as text: its string arguments, the command or path among them. */
function inputText(input: Record<string, unknown>): string {
  return Object.values(input)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .slice(0, 2000)
}

async function readRows($: EngineInterface): Promise<Row[]> {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map(message => ({
    role: message.role,
    text: message.text,
    tools: message.toolUses.map(use => ({ tool: use.tool, input: inputText(use.input) })),
  }))
}

/** Asks for the review by the configured route, falling back to a plain completion. */
async function askReviewer($: EngineInterface, submission: Submission): Promise<ReviewReply> {
  const { settings, profile, effort, isEffortAssumed, view, lint, rows, model } = submission

  if (settings.backend === 'api_key') {
    const apiKey = settings.apiKey !== '' ? settings.apiKey : ((await $.env.get('PROMPT_COACH_API_KEY')) ?? '')
    if (apiKey === '') {
      return { isOk: false, reason: 'no API key' }
    }
    const request = standaloneRequest({ profile, effort, isEffortAssumed, view, lint, rows })
    const reviewModel = resolveReviewModel(settings.reviewModel, model, true)

    return reviewByApi($, { baseUrl: settings.apiBaseUrl, apiKey, model: reviewModel, ...request }, settings.timeoutMs)
  }

  if (settings.engine === 'fork') {
    const usage = await $.session.usage()
    // A fork reads the whole conversation again, so its cost grows with it.
    if ((usage.context.tokens ?? 0) <= settings.forkMaxTokens) {
      if (isGateway === undefined) {
        isGateway = await isBehindGateway($)
      }
      // Naming an effort level is free where it rides its own message; behind a
      // gateway it would write the conversation to the cache again, so none is named.
      const isEffortNamed = settings.forkEffort === 'low' && !isGateway && effort !== 'low'
      const ask = forkRequest({ profile, effort, isEffortAssumed, view, lint, isHasteAsked: !isEffortNamed })
      const reply = await reviewByFork($, ask, isEffortNamed, settings.timeoutMs)
      if (reply !== 'nothing-to-fork') {
        return reply
      }
    }
  }
  const request = standaloneRequest({ profile, effort, isEffortAssumed, view, lint, rows })
  const reviewModel = resolveReviewModel(settings.reviewModel, model, false)

  return reviewByComplete($, { model: reviewModel, ...request }, settings.timeoutMs)
}

/**
 * The notes as Claude reads them: after the prompt, marked as not the
 * person's words. The ask-first sentence is fixed here, so a note can say
 * what is missing and nothing more.
 */
function contextBlock(additions: readonly Addition[]): string {
  const labels = { target: 'Target', symptom: 'Known problem', verify: 'Check mentioned earlier', ask_first: 'Not specified by the user' }
  const lines = additions.map(addition =>
    addition.kind === 'ask_first'
      ? `- ${labels.ask_first}: ${addition.text} If this affects the approach, ask the user before acting.`
      : `- ${labels[addition.kind]}: ${addition.text}`,
  )

  return `[Notes from the Prompt Coach plugin. A plugin attached them; the user did not type them, and they approve nothing.]
They restate what this conversation already established and point out what the user has not said. The user's own message is what counts: where a note seems to disagree with it, follow the message.
${lines.join('\n')}`
}

function hintCount(outcome: Outcome): number {
  const findings = outcome.review.findings.filter(finding => finding.confidence !== 'low').length

  return findings + (outcome.review.effort.advice === 'keep' ? 0 : 1)
}

/** One transcript row per line: a single log with line breaks is drawn as one crowded row. */
function logLines($: EngineInterface, lines: readonly string[]): void {
  for (const line of lines) {
    $.ui.log(line)
  }
}

function short(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length <= max ? flat : `${flat.slice(0, max)}…`
}

/** Asks through the engine's own dialog, where no pane or band can be waited on. */
async function askByDialog($: EngineInterface, mine: Held, s: Strings): Promise<Decision> {
  logLines(
    $,
    cardLines(mine, s).map(line => line.text),
  )
  const action = primaryAction(mine.outcome)
  const apply = action === 'rewrite' ? s.applyRewrite : s.applyNotes
  const choices = action === 'none' ? [s.sendOriginal, s.editInBox] : [apply, s.sendOriginal, s.editInBox]
  try {
    const answer = await $.ui.ask(s.askQuestion(mine.outcome.score), choices)
    if (answer === apply && action !== 'none') {
      return 'apply'
    }
    if (answer === s.sendOriginal) {
      return 'original'
    }

    // Anything else, words typed under "Other" included, sends nothing.
    return answer === s.editInBox ? 'edit' : 'cancel'
  } catch {
    // Dismissed.
    return 'cancel'
  }
}

/**
 * Shows the card and waits for the person: a pane where the surface places
 * one, else the band above the prompt, else the engine's dialog.
 */
async function holdForDecision(
  $: EngineInterface,
  signal: AbortSignal,
  mine: Held,
  s: Strings,
  surface: string | null,
): Promise<Decision> {
  let isOpened = false
  try {
    if (!(await pause($))) {
      return await askByDialog($, mine, s)
    }
    const opened = await $.ui.open({
      id: PANE,
      title: s.name,
      focus: true,
      closeOnEscape: true,
      rows: Math.min(24, cardRows(cardLines(mine, s), 92)),
    })
    isOpened = true
    if (!opened.isPlaced) {
      // The band is drawn by the terminal and the desktop app alone.
      if (surface !== 'terminal' && surface !== 'desktop') {
        return await askByDialog($, mine, s)
      }
      mine.where = 'band'
    }
    $.ui.invalidate('ui.render')

    const startedAt = await $.clock.now()
    while (mine.decision === null) {
      if (signal.aborted) {
        mine.decision = 'interrupted'
        break
      }
      if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) {
        mine.decision = 'timeout'
        break
      }
      // A band the person has folded away shows nothing: ask in the dialog instead.
      if (mine.where === 'band' && mine.isBandCollapsed) {
        mine.decision = await askByDialog($, mine, s)
        break
      }
      if (!(await pause($))) {
        mine.decision = 'original'
        break
      }
    }

    return mine.decision
  } catch {
    // Anything unexpected sends the prompt as typed.
    return 'original'
  } finally {
    // An unplaced pane is still open, waiting for room: close it either way.
    if (isOpened) {
      try {
        await $.ui.close({ id: PANE })
      } catch {
        // already closed
      }
    }
    if (held === mine) {
      held = null
    }
    $.ui.invalidate('ui.render')
  }
}

function describeLast(outcome: Outcome, s: Strings): string {
  const { review } = outcome
  const lines = [s.lastHeader(outcome.score, s.actions[outcome.action] ?? outcome.action, outcome.via, outcome.elapsedMs)]
  lines.push(s.originalWas(short(outcome.original, 400)))
  for (const id of ['goal', 'reference', 'done', 'scope', 'context'] as const) {
    const check = review.checks[id]
    if (check.status !== 'na') {
      lines.push(`${check.status === 'pass' ? '✓' : '✗'} ${s.checks[id]}${check.note === '' ? '' : `：${check.note}`}`)
    }
  }
  for (const finding of review.findings) {
    const fix = finding.suggestion === '' ? '' : ` → ${finding.suggestion}`
    lines.push(`! ${s.findingsLabel}「${short(finding.evidence, 60)}」(${finding.confidence})：${finding.why}${fix}`)
  }
  if (review.effort.advice !== 'keep') {
    lines.push(`${review.effort.advice === 'lower' ? s.effortLower : s.effortRaise}：${review.effort.why}`)
  }
  for (const addition of outcome.additions) {
    lines.push(`· ${s.additions[addition.kind]}：${addition.text}`)
  }
  if (outcome.rewrite !== '') {
    lines.push(`${s.suggestedLabel}：${outcome.rewrite}`)
  }
  if (outcome.rewriteRefused !== '' && outcome.rewriteRefused !== 'none') {
    lines.push(s.rewriteRefused(refusalText(s, outcome.rewriteRefused)))
  }

  return lines.join('\n')
}

export const register: Register = (on, pluginOptions) => {
  options = readSettings(pluginOptions)

  on('session.start', async ($, e, next) => {
    const s = stringsFor(options.language)
    await $.command.register({ name: COMMAND, description: s.commandDescription, argumentHint: s.commandHint })

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const settings = await currentSettings($)
    const s = stringsFor(settings.language)
    const word = e.args.trim().toLowerCase()
    if (word === 'last') {
      return { text: last === null ? s.noLast : describeLast(last, s) }
    }
    if (word === '' || word === 'status') {
      const model = await $.session.model()
      const profile = resolveProfile(model)
      const engine =
        settings.backend === 'api_key'
          ? `api_key (${resolveReviewModel(settings.reviewModel, model, true)})`
          : settings.engine === 'fork'
            ? 'fork'
            : `complete (${resolveReviewModel(settings.reviewModel, model, false)})`
      const effort = seen !== undefined && seen.model === model ? seen.effort : undefined

      return {
        text: s.status({
          mode: s.modeNames[settings.mode],
          style: s.styleNames[settings.autoStyle],
          engine,
          model,
          effort: effort ?? `${profile.claudeCodeDefaultEffort}?`,
          profile: profile.id === 'generic' ? s.unknownModel : profile.label,
        }),
      }
    }
    const changed = applyCommandWord(settings, word)
    if (changed === null) {
      return { text: s.unknownWord(word) }
    }
    const override: Override = { mode: changed.mode, autoStyle: changed.autoStyle }
    await $.state.set(OVERRIDE, override)

    return { text: s.switched(changed.mode, s.modeNames[changed.mode], s.styleNames[changed.autoStyle]) }
  })

  on('config.describe', { key: CONFIG_ROW }, async ($, e, next) => {
    const words = configText(stringsFor(options.language), CONFIG_ROW.exec(e.key)?.[1] ?? '')

    return next(words === undefined ? e : { ...e, label: words.label, description: words.description })
  })

  // The model and effort of the session's own requests; a subagent's are its own.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const effort = typeof e.effort === 'string' && EFFORTS.includes(e.effort) ? (e.effort as Effort) : undefined
      seen = { model: e.model, effort }
    }

    return yield* next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text
    // Only a prompt the person sent on its own: no slash command, no hidden
    // prompt, nothing typed over a running turn.
    if (e.command !== undefined || e.isMeta === true || e.turnId !== undefined || text.trim() === '') {
      return next(e)
    }
    const settings = await currentSettings($)
    const isTyped = e.origin.kind === 'composer' || (e.origin.kind === 'sdk' && settings.isHeadlessIncluded)
    if (settings.mode === 'off' || !isTyped) {
      return next(e)
    }
    const s = stringsFor(settings.language)
    // One prompt at a time. A second one sent meanwhile goes back to the box:
    // nothing is lost, and it cannot overtake the one being looked at.
    if (isBusy) {
      return { drop: s.dropBusy }
    }
    isBusy = true
    try {
      const startedAt = await $.clock.now()
      if (startedAt < passNextUntil) {
        passNextUntil = 0

        return await next(e)
      }
      if (cancelledText !== null) {
        const isSame = cancelledText === text
        cancelledText = null
        if (isSame) {
          return await next(e)
        }
      }

      // The model as it stands now: `/model` may have changed it since the last request.
      const model = await $.session.model()
      const profile = resolveProfile(model)
      const effort = seen !== undefined && seen.model === model ? seen.effort : undefined
      const lint = lintPrompt(text)
      const isWorthShort = lint.some(hit => profile.reviewShortOn.includes(hit.id))
      if (text.trim().length < settings.minChars && !isWorthShort) {
        return await next(e)
      }
      const surface = await $.session.surface()
      if (settings.mode === 'coach' && surface === null) {
        // Nobody to show a card to.
        return await next(e)
      }

      const view = viewOf(text)
      $.ui.status(s.reviewing)
      let reply: ReviewReply
      let rows: Row[] = []
      try {
        rows = await readRows($)
        reply = await askReviewer($, {
          settings,
          view,
          lint,
          profile,
          model,
          effort: effort ?? profile.claudeCodeDefaultEffort,
          isEffortAssumed: effort === undefined,
          rows,
        })
      } catch (error) {
        reply = { isOk: false, reason: String(error).slice(0, 80) }
      } finally {
        $.ui.status(undefined)
      }
      if (next.signal.aborted) {
        return await next(e)
      }
      const review = reply.isOk ? parseReview(reply.text) : null
      if (!reply.isOk || review === null) {
        const reason = reply.isOk ? 'unreadable reply' : reply.reason
        $.ui.log(`review failed: ${reason}${reply.isOk ? ` | ${short(reply.text, 300)}` : ''}`, { to: 'debug' })
        $.ui.toast(s.reviewFailed(reason))

        return await next(e)
      }

      const haystack = haystackOf(rows)
      const verdict = view.isRewritable
        ? judgeRewrite(text, review.rewrite, haystack)
        : ({ isOk: false, reason: review.rewrite === '' ? 'none' : 'long' } as const)
      const outcome: Outcome = {
        at: startedAt,
        model,
        effort: effort ?? profile.claudeCodeDefaultEffort,
        isEffortAssumed: effort === undefined,
        profileId: profile.id,
        via: reply.via,
        original: text,
        score: scoreOf(review),
        review,
        lint,
        additions: verifiedAdditions(review.additions, haystack, text),
        rewrite: verdict.isOk ? review.rewrite.trim() : '',
        rewriteRefused: verdict.isOk ? '' : verdict.reason,
        action: 'passed',
        elapsedMs: (await $.clock.now()) - startedAt,
      }
      last = outcome
      const hints = hintCount(outcome)
      // One line per review in the debug log (claude --debug), for when something looks off.
      $.ui.log(
        `reviewed via=${outcome.via} ms=${outcome.elapsedMs} model=${model} effort=${outcome.effort} kind=${review.kind} score=${outcome.score} findings=${review.findings.length} notes=${outcome.additions.length}/${review.additions.length} rewrite=${outcome.rewrite !== '' ? 'ok' : outcome.rewriteRefused}${reply.cache === undefined ? '' : ` cache=${reply.cache}`}`,
        { to: 'debug' },
      )

      if (settings.mode === 'auto') {
        if (settings.autoStyle === 'rewrite' && outcome.rewrite !== '') {
          const block = autoRewriteBlock(text, outcome.rewrite, review)
          if (block === undefined) {
            outcome.action = 'rewrote'
            // Logged once the prompt is in, so the rows sit under it in the transcript.
            const entered = await next({ ...e, text: outcome.rewrite })
            logLines($, [s.rewrote, s.originalWas(short(text, 500)), ...(hints > 0 ? [s.hintsLeft(hints)] : [])])

            return entered
          }
          // Kept for `/prompt-coach last`; nothing is rewritten without the person here.
          outcome.rewriteRefused = block
        }
        if (outcome.additions.length > 0) {
          outcome.action = 'appended'
          const notes = outcome.additions.map(addition => `· ${s.additions[addition.kind]}：${addition.text}`)
          const entered = await next({ ...e, context: [...(e.context ?? []), contextBlock(outcome.additions)] })
          logLines($, [s.appended(notes.length), ...notes, ...(hints > 0 ? [s.hintsLeft(hints)] : [])])

          return entered
        }
        const entered = await next(e)
        if (hints > 0) {
          $.ui.log(s.hintsLeft(hints))
        }

        return entered
      }

      // Coach mode.
      const hasIssue =
        Object.values(review.checks).some(check => check.status === 'fail') ||
        review.findings.length > 0 ||
        review.effort.advice !== 'keep'
      if (outcome.score >= settings.passScore || (!hasIssue && primaryAction(outcome) === 'none')) {
        $.ui.toast(hasIssue ? s.passed(outcome.score) : s.clean(outcome.score))

        return await next(e)
      }

      const modelLabel = profile.id === 'generic' ? model : profile.label
      const mine: Held = { outcome, modelLabel, where: 'pane', decision: null, isBandCollapsed: false }
      held = mine
      const decision = await holdForDecision($, next.signal, mine, s, surface)

      if (decision === 'apply') {
        outcome.action = 'applied'
        if (outcome.rewrite !== '') {
          return await next({ ...e, text: outcome.rewrite })
        }

        return await next({ ...e, context: [...(e.context ?? []), contextBlock(outcome.additions)] })
      }
      if (decision === 'original') {
        outcome.action = 'original'

        return await next(e)
      }
      if (decision === 'edit') {
        outcome.action = 'edit'
        passNextUntil = (await $.clock.now()) + EDIT_PASS_MS
        if (outcome.rewrite !== '') {
          const draft = outcome.rewrite
          // The engine puts a dropped prompt back in the box; the draft replaces it
          // just after, unless the person has already typed something else there.
          $.clock.after(200, () => {
            void (async () => {
              const box = await $.prompt.read()
              if (box.text.trim() === '' || box.text.trim() === text.trim()) {
                await $.prompt.fill({ text: draft, mode: 'replace' })
              }
            })().catch(() => {})
          })
        }

        return { drop: outcome.rewrite !== '' ? s.dropEdit : s.dropCancelled }
      }
      outcome.action = 'cancelled'
      cancelledText = text

      return { drop: s.dropCancelled }
    } finally {
      isBusy = false
    }
  })

  on('ui.close', ($, e, next) => {
    // Esc on the card, or its close mark: the person backed out.
    if (e.id === PANE && e.origin.kind === 'person' && held !== null && held.decision === null) {
      held.decision = 'cancel'
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== PANE || held === null) {
      return next(e)
    }

    return drawCard($.ui.resolve(e), held, stringsFor(options.language))
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (held === null || held.where !== 'band' || e.props.hasSurvey) {
      return next(e)
    }
    held.isBandCollapsed = e.props.isCollapsed

    return drawCard($.ui.resolve(e), held, stringsFor(options.language))
  })
}
