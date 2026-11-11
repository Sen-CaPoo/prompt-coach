import type { AdditionKind, CheckId, Language } from './types'

/**
 * Every word the person reads, in each interface language.
 *
 * Claude Code heads a plugin's transcript rows, toasts and command output
 * with the plugin's name, so those strings do not repeat it. The card, the
 * dialog question and a drop notice are shown bare, so they name the coach.
 *
 * The names and descriptions of the settings are not here: each build's
 * marketplace entry carries them in its own language.
 */
export type Strings = {
  name: string
  commandDescription: string
  commandHint: string
  reviewing: string
  checks: Record<CheckId, string>
  additions: Record<AdditionKind, string>
  cardTitle: (model: string, effort: string, score: number, passed: number, applicable: number) => string
  effortAssumed: string
  findingsLabel: string
  notesLabel: string
  suggestedLabel: string
  effortLower: string
  effortRaise: string
  applyRewrite: string
  applyNotes: string
  sendOriginal: string
  editInBox: string
  cancel: string
  escHint: string
  askQuestion: (score: number) => string
  clean: (score: number) => string
  passed: (score: number) => string
  reviewFailed: (reason: string) => string
  appended: (count: number) => string
  rewrote: string
  originalWas: (text: string) => string
  rewriteRefused: (reason: string) => string
  hintsLeft: (count: number) => string
  dropCancelled: string
  dropEdit: string
  dropBusy: string
  refusal: Record<string, string>
  modeNames: Record<'coach' | 'auto' | 'off', string>
  styleNames: Record<'append' | 'rewrite', string>
  status: (lines: { mode: string; style: string; engine: string; model: string; effort: string; profile: string }) => string
  switched: (mode: 'coach' | 'auto' | 'off', modeName: string, styleName: string) => string
  unknownWord: (word: string) => string
  noLast: string
  lastHeader: (score: number, action: string, via: string, ms: number) => string
  actions: Record<string, string>
  unknownModel: string
}

const zhTW: Strings = {
  name: '提示詞教練',
  commandDescription: '提示詞教練：切換模式（coach／auto／off）、自動模式的做法（append／rewrite），或查看狀態與上一次的評審',
  commandHint: '[coach|auto|off|append|rewrite|status|last]',
  reviewing: '評審這則 prompt 中…',
  checks: { goal: '目標', done: '完成標準', reference: '指涉', scope: '範圍', context: '缺資訊' },
  additions: { target: '對象', symptom: '問題', verify: '驗證', ask_first: '先問' },
  cardTitle: (model, effort, score, passed, applicable) =>
    `提示詞教練 · ${model} · effort ${effort} · ${score} 分（${applicable} 項適用，${passed} 項通過）`,
  effortAssumed: '（effort 為預設值，這個 session 還沒送過請求）',
  findingsLabel: '寫法',
  notesLabel: '可補充',
  suggestedLabel: '建議版本',
  effortLower: 'effort 建議調低',
  effortRaise: 'effort 建議調高',
  applyRewrite: '套用建議版本',
  applyNotes: '附加補充後送出',
  sendOriginal: '用原文送出',
  editInBox: '放回輸入框修改',
  cancel: '取消送出',
  escHint: 'Esc 也可以取消',
  askQuestion: score => `提示詞教練給這則 ${score} 分，要怎麼送出？`,
  clean: score => `這則沒問題（${score} 分）`,
  passed: score => `${score} 分，已送出`,
  reviewFailed: reason => `這次沒有評審（${reason}），已照原文送出`,
  appended: count => `已附加 ${count} 項補充。Claude 讀得到，你的訊息沒有更動：`,
  rewrote: '已改寫這則 prompt。',
  originalWas: text => `原文：${text}`,
  rewriteRefused: reason => `沒有採用改寫版（${reason}）`,
  hintsLeft: count => `另有 ${count} 項建議沒有套用，用 /prompt-coach last 查看`,
  dropCancelled: '提示詞教練：已取消送出，原文在輸入框裡',
  dropEdit: '提示詞教練：建議版本已放進輸入框，改完按 Enter 送出',
  dropBusy: '提示詞教練：上一則還在處理，這則已放回輸入框，請稍候再送',
  refusal: {
    none: '評審沒有提出改寫',
    same: '改寫版和原文相同',
    long: '這則 prompt 較長，只做補充',
    grew: '改寫版比原文長太多',
    lost: '改寫版少了原文裡的內容',
    new: '改寫版出現了原文和對話裡都沒有的檔案、指令或網址',
    dated: '改寫版加入了不建議的寫法',
    continuation: '這是一句同意或繼續，不代你改寫',
    'not-task': '只有任務型的 prompt 會自動改寫',
    'nothing-failed': '沒有需要修正的項目',
    boundary: '原文含有限制或條件，為了不改到意思，只做補充',
    pasted: '原文較長或含貼上的內容，只做補充',
    risky: '改寫版出現原文沒有提到的高風險動作',
  },
  modeNames: { coach: '教練', auto: '自動', off: '關閉' },
  styleNames: { append: '只附加', rewrite: '整段改寫' },
  status: l =>
    `模式：${l.mode}\n自動模式的做法：${l.style}\n評審方式：${l.engine}\n目前模型：${l.model}（規則：${l.profile}）\n目前 effort：${l.effort}\n這裡的切換只在這個 session 有效；要改預設值，請輸入 /plugin configure prompt-coach@prompt-coach，或到 /config 調整。`,
  switched: (mode, modeName, styleName) => `這個 session 改為「${modeName}」模式${mode === 'auto' ? `（${styleName}）` : ''}。`,
  unknownWord: word => `不認得「${word}」。可用：coach、auto、off、append、rewrite、status、last。`,
  noLast: '這個 session 還沒有評審過任何 prompt。',
  lastHeader: (score, action, via, ms) => `上一次的評審：${score} 分 · ${action} · 評審方式 ${via} · ${(ms / 1000).toFixed(1)} 秒`,
  actions: {
    passed: '直接送出',
    appended: '已附加補充',
    rewrote: '已自動改寫',
    applied: '你選了建議版本',
    original: '你選了原文',
    edit: '你選了放回輸入框',
    cancelled: '你取消了送出',
    skipped: '沒有評審',
  },
  unknownModel: '這個模型沒有專屬規則，只套用通用規則',
}

const en: Strings = {
  name: 'Prompt Coach',
  commandDescription: 'Prompt Coach: switch mode (coach, auto, off) or auto style (append, rewrite), or show status and the last review',
  commandHint: '[coach|auto|off|append|rewrite|status|last]',
  reviewing: 'reviewing this prompt…',
  checks: { goal: 'Goal', done: 'Done criteria', reference: 'Reference', scope: 'Scope', context: 'Missing info' },
  additions: { target: 'Target', symptom: 'Problem', verify: 'Check', ask_first: 'Ask first' },
  cardTitle: (model, effort, score, passed, applicable) =>
    `Prompt Coach · ${model} · effort ${effort} · score ${score} (${passed} of ${applicable} checks passed)`,
  effortAssumed: '(effort is the default level: this session has made no request yet)',
  findingsLabel: 'Wording',
  notesLabel: 'Could add',
  suggestedLabel: 'Suggested version',
  effortLower: 'Consider a lower effort level',
  effortRaise: 'Consider a higher effort level',
  applyRewrite: 'Use the suggested version',
  applyNotes: 'Send with the notes attached',
  sendOriginal: 'Send as typed',
  editInBox: 'Put it back to edit',
  cancel: 'Cancel',
  escHint: 'Esc cancels too',
  askQuestion: score => `Prompt Coach scored this ${score}. How should it be sent?`,
  clean: score => `Nothing to change (${score})`,
  passed: score => `Scored ${score}; sent`,
  reviewFailed: reason => `No review this time (${reason}); sent as typed`,
  appended: count => `Attached ${count} note${count === 1 ? '' : 's'}. Claude reads them; your message is unchanged:`,
  rewrote: 'Rewrote this prompt.',
  originalWas: text => `As typed: ${text}`,
  rewriteRefused: reason => `The rewrite was not used (${reason})`,
  hintsLeft: count => `${count} more suggestion${count === 1 ? ' was' : 's were'} not applied; see /prompt-coach last`,
  dropCancelled: 'Prompt Coach: not sent; your prompt is back in the box',
  dropEdit: 'Prompt Coach: the suggested version is in the box; edit it and press Enter',
  dropBusy: 'Prompt Coach: still working on the previous prompt; this one is back in the box, send it again in a moment',
  refusal: {
    none: 'the review proposed none',
    same: 'it matches what you typed',
    long: 'the prompt is long, so it gets notes only',
    grew: 'it grew far past the original',
    lost: 'it dropped something you typed',
    new: 'it names a file, command or URL that is in neither your prompt nor the conversation',
    dated: 'it added wording the review advises against',
    continuation: 'a go-ahead is never rewritten for you',
    'not-task': 'only task prompts are rewritten unattended',
    'nothing-failed': 'nothing needed fixing',
    boundary: 'your prompt sets a limit or a condition, so it gets notes only',
    pasted: 'the prompt is long or holds pasted material, so it gets notes only',
    risky: 'it brought up a risky action your prompt did not mention',
  },
  modeNames: { coach: 'coach', auto: 'auto', off: 'off' },
  styleNames: { append: 'append', rewrite: 'rewrite' },
  status: l =>
    `Mode: ${l.mode}\nAuto style: ${l.style}\nReview engine: ${l.engine}\nModel: ${l.model} (rules: ${l.profile})\nEffort: ${l.effort}\nSwitching here lasts for this session. To change the defaults, run /plugin configure prompt-coach-en@prompt-coach, or edit them in /config.`,
  switched: (mode, modeName, styleName) => `This session now runs in ${modeName} mode${mode === 'auto' ? ` (${styleName})` : ''}.`,
  unknownWord: word => `Unknown word "${word}". Try: coach, auto, off, append, rewrite, status, last.`,
  noLast: 'No prompt has been reviewed in this session yet.',
  lastHeader: (score, action, via, ms) => `Last review: score ${score} · ${action} · via ${via} · ${(ms / 1000).toFixed(1)} s`,
  actions: {
    passed: 'sent as typed',
    appended: 'notes attached',
    rewrote: 'rewritten automatically',
    applied: 'you chose the suggested version',
    original: 'you chose your own wording',
    edit: 'you put it back to edit',
    cancelled: 'you cancelled',
    skipped: 'not reviewed',
  },
  unknownModel: 'no rules for this model; the general rules apply',
}

export function stringsFor(language: Language): Strings {
  return language === 'en' ? en : zhTW
}

/** The words for why a rewrite was refused; `lost:<span>` and `new:<span>` name the span. */
export function refusalText(s: Strings, reason: string): string {
  const [kind, ...rest] = reason.split(':')
  const span = rest.join(':')
  if ((kind === 'lost' || kind === 'new') && span !== '') {
    return `${s.refusal[kind] ?? kind}：${span}`
  }

  return s.refusal[reason] ?? reason
}
