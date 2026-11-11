import { REWRITE_MAX_CHARS, REWRITE_MAX_LINES } from './request'
import { clausesOf, containsToken, fold, hasCjk } from './text'
import type { Addition, Review, Row } from './types'

/**
 * What stands between the reviewer's proposals and the prompt.
 *
 * In testing, every reviewer added things the person never said: three
 * models asked for a new test, a fork wrote a scope limit. Instructions to
 * the reviewer are not enough, so these checks are done in code.
 *
 * A note (attached beside the prompt, the person's words untouched):
 * - must quote the conversation, and name nothing its own quote and the
 *   prompt do not
 * - an ask-first note may not grant anything or bring up an action the
 *   prompt never mentioned
 *
 * A rewrite (it replaces the person's words, so it is held to more):
 * - every number, path, mention, URL, quoted string, code block and pasted
 *   line of the original must survive as a whole
 * - every clause that sets a boundary must survive as a whole clause, so
 *   "don't touch X" cannot become "don't touch anything but X"
 * - it may name no file, command, flag or risky action that neither the
 *   prompt nor the conversation named
 *
 * A rewrite applied without asking is held to more again: only a short,
 * plain task prompt with something to fix, no boundary of any kind in it,
 * and nothing that reads as an approval. Everything else gets notes.
 */

const MAX_NOTES = 5
const MAX_ASK_FIRST = 2
const MIN_QUOTE_CHARS = 6
const MAX_NOTE_CHARS = 300

/** Only the recent conversation is searched, so a long session costs no more than a short one. */
const HAYSTACK_ROWS = 400
const HAYSTACK_CHARS = 400_000

/** An unattended rewrite is for short, plain prompts. */
export const AUTO_REWRITE_MAX_CHARS = 600
export const AUTO_REWRITE_MAX_LINES = 5

/**
 * What the person and the assistant said and did, as one searchable text:
 * their messages and the inputs of the tools the assistant called. Tool
 * results are left out: a fetched page or a file's contents is data, and
 * nothing in it counts as known to the conversation.
 */
export function haystackOf(rows: readonly Row[]): string {
  const parts: string[] = []
  for (const row of rows.slice(-HAYSTACK_ROWS)) {
    parts.push(row.text)
    for (const use of row.tools) {
      parts.push(use.input)
    }
  }

  return fold(parts.join('\n').slice(-HAYSTACK_CHARS))
}

const NAMED: readonly RegExp[] = [
  /`[^`\n]+`/g,
  /https?:\/\/[^\s)>\]」）】]+/g,
  /@[\w.~\\/-]+/g,
  // Paths: something/with/slashes, or a file name with an extension.
  /[\w.~-]+(?:[\\/][\w.~-]+)+/g,
  /\b[\w-]+\.[A-Za-z][A-Za-z0-9]{0,4}\b/g,
]
/** Abbreviations that look like file names and are not. */
const NOT_FILES = new Set(['e.g', 'i.e', 'a.m', 'p.m', 'vs.', 'etc.'])

/** Paths, file names, URLs, mentions and code spans: the things a model can make up. */
export function namedThings(text: string): string[] {
  const things = new Set<string>()
  for (const pattern of NAMED) {
    for (const found of text.matchAll(pattern)) {
      const thing = found[0].replace(/[.,;:!?。，；：！？]+$/, '')
      if (thing.length >= 3 && !NOT_FILES.has(thing.toLowerCase())) {
        things.add(thing)
      }
    }
  }

  return [...things]
}

const FLAG = /(?<![\w-])--?[A-Za-z][\w-]*/g
const COMMAND =
  /\b(git|npm|npx|pnpm|yarn|bun|pip|pipx|uv|brew|apt|rm|mv|cp|curl|wget|docker|kubectl|helm|terraform|sudo|chmod|chown|ssh|scp|make|bash|sh|zsh|powershell|pwsh|cmd)\b/gi
const RISKY_EN =
  /\b(push|force|deploy|reset|drop|delet|truncat|merg|rebas|publish|releas|uninstall|migrat|revert|overwrit|wipe|purg|rm|sudo)\w*/gi
const RISKY_ZH = /刪除|刪掉|移除|部署|推送|推到|合併|重建|覆蓋|強制|發佈|發布|還原|重置|清空|遷移|上線|解除安裝/g

function matches(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map(found => found[0].toLowerCase())
}

/** Commands and flags a text names: `git`, `npm`, `--force`. */
export function commandWords(text: string): string[] {
  return [...new Set([...matches(text, FLAG), ...matches(text, COMMAND)])]
}

/** Words for actions that are hard to take back: push, deploy, delete, 刪除, 部署. */
export function riskyWords(text: string): string[] {
  return [...new Set([...matches(text, RISKY_EN), ...matches(text, RISKY_ZH)])]
}

const ASCII_WORD = /[A-Za-z][A-Za-z0-9_-]{2,}/g

/**
 * A test for whether a command, a flag or an action word is in a text. A
 * Latin word has to stand there as a word of its own (`rm` is not in
 * `form`); a flag or a Chinese word is looked for as written.
 */
function wordsIn(known: string): (word: string) => boolean {
  const where = known.toLowerCase()
  const words = new Set(where.match(/[a-z0-9_]+/g) ?? [])

  return word => (/^[a-z0-9_]+$/.test(word) ? words.has(word) : where.includes(word))
}

/**
 * The first thing a text names that is nowhere in what is known: a path, a
 * file, a URL, a code span, a command, a flag, or a risky action. For a
 * prompt in Chinese, Japanese or Korean, any Latin word counts too, since
 * such words there are names. Undefined when everything is accounted for.
 */
export function inventedThing(text: string, known: string, isStrict: boolean): string | undefined {
  const where = known.toLowerCase()
  const isKnown = wordsIn(known)
  for (const thing of namedThings(text)) {
    if (!containsToken(where, fold(thing).toLowerCase())) {
      return thing
    }
  }
  for (const word of [...commandWords(text), ...riskyWords(text)]) {
    if (!isKnown(word)) {
      return word
    }
  }
  if (isStrict) {
    for (const word of matches(text, ASCII_WORD)) {
      if (!where.includes(word)) {
        return word
      }
    }
  }

  return undefined
}

/** Words by which a note would hand out a permission or take one for granted. */
const GRANTS =
  /已(經)?(同意|核准|允許|授權|確認)|不用(再)?(問|確認)|不必(再)?(問|確認)|無須(再)?(問|確認)|直接(做|執行|刪|部署|推|改)|\b(approved|agreed|consented|no need to ask|without asking|go ahead|feel free)\b/i

/**
 * The notes that may be attached. The haystack is the conversation before
 * this prompt, so the prompt cannot vouch for itself.
 */
export function verifiedAdditions(additions: readonly Addition[], haystack: string, original: string): Addition[] {
  const prompt = fold(original)
  const isStrict = hasCjk(original)
  const isInPrompt = wordsIn(prompt)
  const kept: Addition[] = []
  let askFirst = 0
  for (const addition of additions) {
    if (kept.length >= MAX_NOTES) {
      break
    }
    const text = addition.text.slice(0, MAX_NOTE_CHARS)
    if (GRANTS.test(text)) {
      continue
    }
    if (addition.kind === 'ask_first') {
      // It may name what the conversation named, and no action the prompt did not bring up.
      const isActionNew = riskyWords(text).some(word => !isInPrompt(word))
      if (askFirst >= MAX_ASK_FIRST || isActionNew || inventedThing(text, `${haystack} ${prompt}`, false) !== undefined) {
        continue
      }
      kept.push({ kind: 'ask_first', text, quote: '' })
      askFirst += 1
      continue
    }
    const quote = fold(addition.quote)
    if (quote.length < MIN_QUOTE_CHARS || !haystack.includes(quote)) {
      continue
    }
    // The quote has to carry the note: what the note names is in its own quote, or in the prompt.
    if (inventedThing(text, `${quote} ${prompt}`, isStrict) !== undefined) {
      continue
    }
    kept.push({ kind: addition.kind, text, quote })
  }

  return kept
}

/**
 * Wording that sets a boundary, a condition or a limit. Broad on purpose: a
 * clause that matches is held word for word, and a prompt that has one is
 * never rewritten unattended, so a false match only costs a rewrite.
 */
const BOUNDARY =
  /不要|不可|不能|不准|不得|不許|不用|不必|不動|不改|不碰|不刪|不加|不需|別|勿|禁止|嚴禁|避免|只|僅|保留|維持|除了|以外|之外|除非|直到|之前|前先|先問|先確認|先不|暫時|才能|才可|\b(don't|dont|do not|never|must not|mustn't|cannot|can't|cant|shouldn't|should not|not allowed|until|unless|except|only|before|after|without|leave|keep|avoid|preserve|as is|as-is|untouched)\b/i

export function isBoundary(clause: string): boolean {
  return BOUNDARY.test(fold(clause))
}

/** Wording that sets an order of steps: 「先看 log 再改」. A rewrite could quietly reorder it. */
const SEQUENCE = /先|然後|之後|以後|完後|完再|接著|再來|\b(first|then|once|afterwards?)\b/i

/** Whether a prompt sets a limit, a condition or an order of steps anywhere. */
export function hasBoundary(text: string): boolean {
  return clausesOf(text).some(isBoundary) || SEQUENCE.test(fold(text))
}

// A reply word counts when it stands alone: 「對，就這樣」, 「可以」, 「好 繼續」; not 「對了…」 or 「可以幫我…嗎」.
// It errs toward yes: a task read as a go-ahead only loses its unattended rewrite.
const APPROVAL_START =
  /^((好|行|對|是|嗯|可以|沒問題|同意)(?=$|[\s,.!~、。]|的|啊|吧|喔|呀|哦)|就這樣|就用|就照|照你|照這|按照|依照|繼續|請繼續|開始吧|動手|做吧|(ok|okay|yes|yep|yeah|sure|go|lgtm|proceed|continue|sounds good|do it|approved?|agreed)\b)/i
const APPROVAL_INSIDE = /照你|照這|按你|依你|就這樣|開始吧|做吧|動手吧|go ahead|sounds good|lgtm|as (you )?proposed|your plan/i

/**
 * Whether a prompt reads as a go-ahead for something the assistant proposed.
 * Claude Code's permission classifier reads the person's messages as their
 * approvals, so such a prompt is never expanded on the person's behalf.
 */
export function looksLikeApproval(text: string): boolean {
  const short = fold(text)

  return short.length <= 60 && (APPROVAL_START.test(short) || APPROVAL_INSIDE.test(short))
}

/** A line that reads as pasted code or log output. */
function isDataLine(line: string): boolean {
  const text = line.trim()
  if (text === '') {
    return false
  }
  if (/^\s{2,}\S/.test(line) && /[{}();=<>[\]]/.test(text)) {
    return true
  }
  if (/^(at |\$ |> |\d{4}-\d{2}-\d{2}|\[\d|\w+(Error|Exception):|Traceback|ERROR\b|WARN\b|INFO\b|DEBUG\b)/.test(text)) {
    return true
  }
  if (/^(def |class |function |const |let |var |import |from |return |if \(|for \(|while \(|#include|public |private )/.test(text)) {
    return true
  }

  return (text.match(/[{}();=<>[\]|]/g) ?? []).length >= 3
}

export function dataLines(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .filter(isDataLine)
}

function numberTokens(folded: string): string[] {
  return folded.match(/\d+(?:[.:]\d+)*/g) ?? []
}

function quotedStrings(text: string): string[] {
  return text.match(/"[^"\n]{2,}"|「[^」\n]+」|『[^』\n]+』|“[^”\n]{2,}”/g) ?? []
}

/** Wording the review calls dated: a rewrite must not introduce it. */
const DATED = /think step by step|一步一步(想|思考)|\b(MUST|CRITICAL)\b/

export type RewriteVerdict = { isOk: true } | { isOk: false; reason: string }

function lost(what: string): RewriteVerdict {
  return { isOk: false, reason: `lost:${what.trim().slice(0, 60)}` }
}

/**
 * Whether a rewrite may stand in for the original at all (in coach mode the
 * person still has to pick it). `reason` names the first thing that rules it
 * out, in a form the card can show.
 */
export function judgeRewrite(original: string, rewrite: string, haystack = ''): RewriteVerdict {
  const candidate = rewrite.trim()
  if (candidate === '') {
    return { isOk: false, reason: 'none' }
  }
  const before = fold(original)
  const after = fold(candidate)
  if (before === after) {
    return { isOk: false, reason: 'same' }
  }
  if (original.length > REWRITE_MAX_CHARS || original.split('\n').length > REWRITE_MAX_LINES) {
    return { isOk: false, reason: 'long' }
  }
  if (candidate.length > Math.max(600, original.length * 8)) {
    return { isOk: false, reason: 'grew' }
  }

  // Code blocks and pasted lines: exactly, indentation included.
  for (const block of original.match(/```[\s\S]*?```/g) ?? []) {
    if (!candidate.includes(block)) {
      return lost(block)
    }
  }
  for (const line of dataLines(original)) {
    if (!candidate.includes(line.trimEnd())) {
      return lost(line)
    }
  }
  // Numbers as whole numbers: 5 is not kept by 15.
  const numbers = new Set(numberTokens(after))
  for (const number of numberTokens(before)) {
    if (!numbers.has(number)) {
      return lost(number)
    }
  }
  // Paths, files, mentions, URLs and code spans as whole names.
  for (const thing of namedThings(original)) {
    if (!containsToken(after, fold(thing))) {
      return lost(thing)
    }
  }
  for (const quoted of quotedStrings(original)) {
    if (!after.includes(fold(quoted))) {
      return lost(quoted)
    }
  }
  if (/\bultrathink\b/i.test(original) && !/\bultrathink\b/i.test(candidate)) {
    return lost('ultrathink')
  }
  // Boundaries as whole clauses: nothing may be tacked on that turns one around.
  // The full stop or colon a clause ends on is not part of it.
  const bare = (clause: string) => fold(clause).replace(/[.:]+$/, '')
  const clauses = new Set(clausesOf(candidate).map(bare))
  for (const clause of clausesOf(original)) {
    if (isBoundary(clause) && !clauses.has(bare(clause))) {
      return lost(clause)
    }
  }

  if (DATED.test(candidate) && !DATED.test(original)) {
    return { isOk: false, reason: 'dated' }
  }
  // Nothing may be named that neither the person nor the conversation named.
  const invented = inventedThing(candidate, `${haystack} ${before}`, hasCjk(original))
  if (invented !== undefined) {
    return { isOk: false, reason: `new:${invented.slice(0, 60)}` }
  }

  return { isOk: true }
}

/**
 * Why a rewrite that passed `judgeRewrite` still may not be applied without
 * the person's say-so, or undefined when it may.
 */
export function autoRewriteBlock(original: string, rewrite: string, review: Review): string | undefined {
  if (review.kind === 'continuation' || looksLikeApproval(original)) {
    return 'continuation'
  }
  if (review.kind !== 'task') {
    return 'not-task'
  }
  if (!Object.values(review.checks).some(check => check.status === 'fail')) {
    return 'nothing-failed'
  }
  if (hasBoundary(original)) {
    return 'boundary'
  }
  if (
    original.length > AUTO_REWRITE_MAX_CHARS ||
    original.split('\n').length > AUTO_REWRITE_MAX_LINES ||
    original.includes('```') ||
    dataLines(original).length > 0
  ) {
    return 'pasted'
  }
  // An action that is hard to take back has to be in the person's own prompt.
  const isInPrompt = wordsIn(fold(original))
  if (riskyWords(rewrite).some(word => !isInPrompt(word))) {
    return 'risky'
  }

  return undefined
}
