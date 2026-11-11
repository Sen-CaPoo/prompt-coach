import type { ModelCompleteResult, On, RenderSurface } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

// Coach mode with a prompt held: the card in a pane, in the band above the
// prompt, and what happens around it. Here the wait command really waits (a
// quarter second of the mocked clock), so the mod shows its card instead of
// the dialog, and the test moves the clock to let the wait run.

const PROMPT = '幫我把登入那邊改好'
const OTHER = '幫我把註冊那邊也改好'
const REWRITE = '修正登入頁回傳 401 時沒有顯示錯誤訊息的問題。'

const REVIEW = {
  kind: 'task',
  checks: {
    goal: { status: 'pass', note: '' },
    done: { status: 'fail', note: '沒有完成標準' },
    reference: { status: 'fail', note: '沒有指明檔案' },
    scope: { status: 'fail', note: '沒有說範圍' },
    context: { status: 'pass', note: '' },
  },
  findings: [],
  additions: [],
  effort: { advice: 'keep', why: '' },
  rewrite: REWRITE,
}

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const PANE = {
  plugin: 'prompt-coach',
  component: 'Pane',
  requestId: 'prompt-coach',
  props: { title: '提示詞教練', isFocused: true, bodyColumns: 90, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const band = (isCollapsed: boolean) =>
  ({
    plugin: 'prompt-coach',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isCollapsed, isWorking: false, maxRows: 30, bodyColumns: 90, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

type World = { isPlaced?: boolean; surface?: RenderSurface; reviewMs?: number; ask?: string }
type Sent = { text?: string; context?: readonly string[]; drop?: string }

function world(on: On, w: World = {}) {
  const clock = mock.clock(on)
  mock.env(on, {})
  mock.store(on)
  on('session.id', () => ({ value: 'session-1' }))
  const calls = { fork: 0, opens: 0, closes: [] as string[], asks: 0, fills: [] as string[] }
  const answered = (text: string): ModelCompleteResult => ({ isAnswered: true, text, usage: USAGE })

  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.surface', () => ({ value: w.surface ?? 'terminal' }))
  on('session.messages', () => ({ value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('model.fork', async () => {
    calls.fork += 1
    if (w.reviewMs !== undefined) {
      await clock.sleep(w.reviewMs)
    }

    return { value: answered(JSON.stringify(REVIEW)) }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => {
    calls.opens += 1

    return { value: w.isPlaced === false ? { isPlaced: false, reason: 'no room' } : { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    calls.closes.push(e.id)

    return { value: undefined }
  })
  on('process.run', async () => {
    await clock.sleep(250)

    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('tool.call', (_, e) => {
    calls.asks += 1
    const questions = (e as unknown as { questions: { question: string }[] }).questions

    return { result: { answers: { [questions[0]?.question ?? '']: w.ask ?? '用原文送出' } } }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('prompt.fill', (_, e) => {
    calls.fills.push(e.text)

    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))

  return { clock, calls }
}

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as const
const options = { mode: 'coach' }

describe('the card in a pane', () => {
  test('shows the review with four choices; 1 sends the suggested version', { options }, async ($, on) => {
    const { clock, calls } = world(on)
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /40 分/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /完成標準：沒有完成標準/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+ 修正登入頁/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).length).toBe(4)
    // Nothing is sent while the card is up.
    expect(done).toBeUndefined()

    await $.ui.press({ plugin: 'prompt-coach', key: 'apply' })
    await ui.unmount()
    await clock.advance(1000)
    await sending

    expect(done?.text).toBe(REWRITE)
    expect(calls.closes).toEqual(['prompt-coach'])
    expect(calls.asks).toBe(0)
  })

  test('2 sends the prompt as typed', { options }, async ($, on) => {
    const { clock } = world(on)
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)
    await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'prompt-coach', key: 'original' })
    await clock.advance(1000)
    await sending

    expect(done?.text).toBe(PROMPT)
    expect(done?.context).toBeUndefined()
  })

  test('3 puts the suggested version in the box, and what is sent next goes through', { options }, async ($, on) => {
    const { clock, calls } = world(on)
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)
    await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'prompt-coach', key: 'edit' })
    await clock.advance(1000)
    await sending

    expect(done?.drop).toContain('建議版本已放進輸入框')
    expect(calls.fills).toEqual([REWRITE])
    const edited = await $.prompt.submit(typed(`${REWRITE} 訊息用紅字`))
    expect(edited.text).toBe(`${REWRITE} 訊息用紅字`)
    expect(calls.fork).toBe(1)
  })

  test('4 cancels: nothing is sent, and the same words sent again go through', { options }, async ($, on) => {
    const { clock, calls } = world(on)
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)
    await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'prompt-coach', key: 'cancel' })
    await clock.advance(1000)
    await sending

    expect(done?.drop).toContain('已取消送出')
    expect(done?.text).toBeUndefined()
    const again = await $.prompt.submit(typed(PROMPT))
    expect(again.text).toBe(PROMPT)
    expect(calls.fork).toBe(1)
  })

  test('a card nobody answers in ten minutes sends nothing', { options, timeoutMs: 120_000 }, async ($, on) => {
    const { clock, calls } = world(on)
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(10 * 60 * 1000 + 2000)
    await sending

    expect(typeof done?.drop).toBe('string')
    expect(calls.closes).toEqual(['prompt-coach'])
  })
})

describe('one prompt at a time', () => {
  test('a prompt sent while another is being reviewed goes back to the box', { options }, async ($, on) => {
    const { clock, calls } = world(on, { reviewMs: 5000 })
    let first: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (first = sent))
    await clock.settle()

    const second = await $.prompt.submit(typed(OTHER))
    expect(second.drop).toContain('上一則還在處理')
    expect(calls.fork).toBe(1)

    // The first one's card comes up as if nothing had happened.
    await clock.advance(6000)
    let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /\+ 修正登入頁/ })).toBeDefined()
    await $.ui.press({ plugin: 'prompt-coach', key: 'original' })
    await ui.unmount()
    await clock.advance(1000)
    await sending
    expect(first?.text).toBe(PROMPT)

    // With the first one sent, the second is reviewed like any other.
    const retry = $.prompt.submit(typed(OTHER))
    await clock.advance(6000)
    ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'prompt-coach', key: 'original' })
    await ui.unmount()
    await clock.advance(1000)
    expect((await retry).text).toBe(OTHER)
    expect(calls.fork).toBe(2)
  })

  test('a prompt sent while a card is up goes back to the box too', { options }, async ($, on) => {
    const { clock } = world(on)
    const sending = $.prompt.submit(typed(PROMPT))
    await clock.advance(1000)

    expect((await $.prompt.submit(typed(OTHER))).drop).toContain('上一則還在處理')
    await $.ui.mount({ ...PANE, surface: 'terminal' })
    await $.ui.press({ plugin: 'prompt-coach', key: 'original' })
    await clock.advance(1000)
    expect((await sending).text).toBe(PROMPT)
  })
})

describe('where no pane is placed', () => {
  test('the card is drawn in the band above the prompt, and the waiting pane is closed after', { options }, async ($, on) => {
    const { clock, calls } = world(on, { isPlaced: false })
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)

    const ui = await $.ui.mount({ ...band(false), surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /\+ 修正登入頁/ })).toBeDefined()
    expect((await ui.findAll({ type: 'Button' })).length).toBe(4)
    await $.ui.press({ plugin: 'prompt-coach', key: 'apply' })
    await ui.unmount()
    await clock.advance(1000)
    await sending

    expect(done?.text).toBe(REWRITE)
    expect(calls.opens).toBe(1)
    expect(calls.closes).toEqual(['prompt-coach'])
    expect(calls.asks).toBe(0)
  })

  test('a band the person has folded away asks through the dialog', { options }, async ($, on) => {
    const { clock, calls } = world(on, { isPlaced: false, ask: '套用建議版本' })
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)
    await $.ui.mount({ ...band(true), surface: 'terminal' })
    await clock.advance(1000)
    await sending

    expect(calls.asks).toBe(1)
    expect(done?.text).toBe(REWRITE)
    expect(calls.closes).toEqual(['prompt-coach'])
  })

  test('a surface with no band asks through the dialog', { options }, async ($, on) => {
    const { clock, calls } = world(on, { isPlaced: false, surface: 'vscode', ask: '用原文送出' })
    let done: Sent | undefined
    const sending = $.prompt.submit(typed(PROMPT)).then(sent => (done = sent))
    await clock.advance(1000)
    await sending

    expect(calls.asks).toBe(1)
    expect(done?.text).toBe(PROMPT)
    expect(calls.closes).toEqual(['prompt-coach'])
  })
})
