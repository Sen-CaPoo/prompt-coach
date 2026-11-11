// Small text helpers shared by the scan, the request and the guards.

export function squash(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Text as it is compared: compatibility forms folded (full-width digits and
 * punctuation become plain ones), curly quotes straightened, backslashes
 * turned to slashes, Markdown backticks and asterisks dropped, whitespace
 * squashed. Only ever used on both sides of a comparison, never shown.
 */
export function fold(text: string): string {
  return squash(
    text
      .normalize('NFKC')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\\/g, '/')
      .replace(/[`*]/g, ''),
  )
}

/** True when the text holds Chinese, Japanese or Korean characters. */
export function hasCjk(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x3400 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7a3)) {
      return true
    }
  }

  return false
}

/** A text split where a sentence or a clause ends, empty pieces dropped. */
export function clausesOf(text: string): string[] {
  return text
    .split(/[。！？!?；;，,\n]/)
    .map(clause => clause.trim())
    .filter(clause => clause !== '')
}

/** What may not come right before a name, and right after it, for the name to stand whole. */
const NAME_BEFORE = /[A-Za-z0-9_.-]/
const NAME_AFTER = /[A-Za-z0-9_./-]/

/**
 * Whether `token` stands in `text` as a whole: not as part of a longer name
 * (`session.ts` is not in `mysession.ts` or `session.tsx`), nor as the start
 * of a longer path (`src/auth` is not in `src/auth/login.ts`). The end of a
 * path does count: `login.ts` is in `src/auth/login.ts`.
 */
export function containsToken(text: string, token: string): boolean {
  if (token === '') {
    return true
  }
  let from = 0
  for (;;) {
    const at = text.indexOf(token, from)
    if (at === -1) {
      return false
    }
    const before = at === 0 ? '' : (text[at - 1] ?? '')
    const after = text[at + token.length] ?? ''
    // A full stop that ends the sentence is not part of a longer name.
    const isSentenceEnd = after === '.' && !/[A-Za-z0-9_]/.test(text[at + token.length + 1] ?? '')
    if (!NAME_BEFORE.test(before) && (!NAME_AFTER.test(after) || isSentenceEnd)) {
      return true
    }
    from = at + 1
  }
}
