// Shared types. No engine calls here.

export type Mode = 'coach' | 'auto' | 'off'
export type AutoStyle = 'append' | 'rewrite'
export type Backend = 'session' | 'api_key'
export type Engine = 'fork' | 'complete'
export type Language = 'zh-TW' | 'en'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type Settings = {
  mode: Mode
  autoStyle: AutoStyle
  passScore: number
  backend: Backend
  engine: Engine
  /** `low`: the fork names its own effort level. `session`: it names none and runs at the session's. */
  forkEffort: 'low' | 'session'
  reviewModel: string
  apiKey: string
  apiBaseUrl: string
  timeoutMs: number
  minChars: number
  forkMaxTokens: number
  isHeadlessIncluded: boolean
}

export type CheckId = 'goal' | 'done' | 'reference' | 'scope' | 'context'
export type CheckStatus = 'pass' | 'fail' | 'na'
export type Check = { status: CheckStatus; note: string }

export type Confidence = 'high' | 'medium' | 'low'
export type FindingAction = 'remove' | 'rewrite' | 'effort' | 'flag'

/** One dated or model-unfit piece of wording, tied to a named pattern. */
export type Finding = {
  id: string
  evidence: string
  why: string
  confidence: Confidence
  action: FindingAction
  suggestion: string
}

export type AdditionKind = 'target' | 'symptom' | 'verify' | 'ask_first'

/** A note the prompt could carry. All but `ask_first` must quote the conversation. */
export type Addition = {
  kind: AdditionKind
  text: string
  quote: string
}

export type PromptKind = 'task' | 'question' | 'explore' | 'continuation' | 'other'
export type EffortAdvice = 'keep' | 'lower' | 'raise'

/** The reviewer's reply, after parsing and validation. */
export type Review = {
  kind: PromptKind
  checks: Record<CheckId, Check>
  findings: Finding[]
  additions: Addition[]
  effort: { advice: EffortAdvice; why: string }
  rewrite: string
}

/** A pattern the instant scan matched, before any model call. */
export type LintHit = {
  id: string
  evidence: string
}

/** The prompt as the reviewer is shown it: whole, or head and tail of a long one. */
export type PromptView = {
  text: string
  /** True when the middle was left out. */
  isPartial: boolean
  /** False for a long prompt: it gets notes, never a replacement. */
  isRewritable: boolean
}

/**
 * One row of the conversation, as much of it as the mod reads: what was said,
 * and what the assistant asked its tools to do. What the tools answered is
 * left out: it is data, and may hold text nobody in the conversation wrote.
 */
export type Row = {
  role: 'user' | 'assistant'
  text: string
  tools: readonly { tool: string; input: string }[]
}

/** What the mod decided for one prompt; kept for `/prompt-coach last`. */
export type Outcome = {
  at: number
  model: string
  effort: Effort
  isEffortAssumed: boolean
  profileId: string
  via: string
  original: string
  score: number
  review: Review
  lint: LintHit[]
  /** Additions whose quotes were found in the conversation, plus ask-first notes. */
  additions: Addition[]
  /** The reviewer's rewrite when it passed the guard, else ''. */
  rewrite: string
  /** Why a rewrite the reviewer proposed was not used. */
  rewriteRefused: string
  action: 'passed' | 'appended' | 'rewrote' | 'applied' | 'original' | 'edit' | 'cancelled' | 'skipped'
  elapsedMs: number
}
