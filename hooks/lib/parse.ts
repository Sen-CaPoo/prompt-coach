import type {
  Addition,
  AdditionKind,
  Check,
  CheckId,
  CheckStatus,
  Confidence,
  EffortAdvice,
  Finding,
  FindingAction,
  PromptKind,
  Review,
} from './types'

const CHECK_IDS: readonly CheckId[] = ['goal', 'done', 'reference', 'scope', 'context']
const STATUSES: readonly CheckStatus[] = ['pass', 'fail', 'na']
const KINDS: readonly PromptKind[] = ['task', 'question', 'explore', 'continuation', 'other']
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low']
const ACTIONS: readonly FindingAction[] = ['remove', 'rewrite', 'effort', 'flag']
const ADDITION_KINDS: readonly AdditionKind[] = ['target', 'symptom', 'verify', 'ask_first']
const ADVICE: readonly EffortAdvice[] = ['keep', 'lower', 'raise']

const MIN_CHECKS = 3
const MAX_FINDINGS = 8
const MAX_ADDITIONS = 6
const MAX_TEXT = 600
const MAX_REWRITE = 12000

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function str(value: unknown, max = MAX_TEXT): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * The JSON object inside a reply. Models sometimes wrap it in a code fence or
 * add a sentence around it, so this takes the outermost braces it can parse.
 */
export function extractJson(reply: string): unknown {
  const text = reply.trim()
  let tried = 0
  for (let start = text.indexOf('{'); start !== -1 && tried < 6; start = text.indexOf('{', start + 1)) {
    tried += 1
    const end = closingBrace(text, start)
    if (end === -1) {
      continue
    }
    try {
      return JSON.parse(text.slice(start, end + 1)) as unknown
    } catch {
      // not this one; try the next opening brace
    }
  }

  return undefined
}

/** Where the object opened at `start` closes, braces inside strings not counted; -1 when it never does. */
function closingBrace(text: string, start: number): number {
  let depth = 0
  let isInString = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (isInString) {
      if (char === '\\') {
        i += 1
      } else if (char === '"') {
        isInString = false
      }
    } else if (char === '"') {
      isInString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

/**
 * A reviewer's reply as a Review, or null when it is not one. Missing parts
 * get harmless defaults (a check not reported is `na`); unknown values are
 * dropped rather than trusted.
 */
export function parseReview(reply: string): Review | null {
  const root = record(extractJson(reply))
  const rawChecks = record(root.checks)

  const checks = {} as Record<CheckId, Check>
  let reported = 0
  for (const id of CHECK_IDS) {
    const raw = record(rawChecks[id])
    if (typeof raw.status === 'string' && (STATUSES as readonly string[]).includes(raw.status)) {
      reported += 1
    }
    checks[id] = { status: pick(raw.status, STATUSES, 'na'), note: str(raw.note) }
  }
  // A reply that reports fewer than three of the five checks is not a review:
  // read as one, it would score 100 and tell the person nothing is wrong.
  if (reported < MIN_CHECKS) {
    return null
  }

  const findings: Finding[] = []
  for (const item of list(root.findings).slice(0, MAX_FINDINGS)) {
    const raw = record(item)
    const id = str(raw.id, 64)
    if (id === '') {
      continue
    }
    findings.push({
      id,
      evidence: str(raw.evidence),
      why: str(raw.why),
      confidence: pick(raw.confidence, CONFIDENCES, 'low'),
      action: pick(raw.action, ACTIONS, 'flag'),
      suggestion: str(raw.suggestion),
    })
  }

  const additions: Addition[] = []
  for (const item of list(root.additions).slice(0, MAX_ADDITIONS)) {
    const raw = record(item)
    const text = str(raw.text)
    if (text === '' || typeof raw.kind !== 'string' || !(ADDITION_KINDS as readonly string[]).includes(raw.kind)) {
      continue
    }
    additions.push({ kind: raw.kind as AdditionKind, text, quote: str(raw.quote) })
  }

  const effort = record(root.effort)

  return {
    kind: pick(root.kind, KINDS, 'other'),
    checks,
    findings,
    additions,
    effort: { advice: pick(effort.advice, ADVICE, 'keep'), why: str(effort.why) },
    rewrite: str(root.rewrite, MAX_REWRITE),
  }
}
