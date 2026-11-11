import type { Elements } from 'claude-code'

import type { Strings } from './strings'
import type { CheckId, Outcome } from './types'

export type Decision = 'apply' | 'original' | 'auto-sent' | 'edit' | 'cancel' | 'timeout' | 'interrupted'

/** A prompt held while the person decides. */
export type Held = {
  outcome: Outcome
  modelLabel: string
  where: 'pane' | 'band'
  decision: Decision | null
  /** Set while drawing: the person has the band folded away, so the card cannot be seen there. */
  isBandCollapsed: boolean
  /** While a countdown runs: whole seconds left before the prompt is sent as typed. */
  secondsLeft?: number
}

export type CardLine = {
  tone: 'title' | 'tipsLabel' | 'tip' | 'more' | 'effort' | 'promptLabel' | 'kept' | 'new' | 'dim'
  text: string
}

const CHECK_ORDER: readonly CheckId[] = ['goal', 'reference', 'done', 'scope', 'context']
/** Tips on the card; the rest are in `/prompt-coach last`. */
const MAX_TIPS = 5
const MAX_EVIDENCE = 40
/** How much of the typed prompt the card shows above the notes that would follow it. */
const MAX_KEPT = 60
const MAX_REWRITE = 1200

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** What 1 does on this card: send the rewrite, send the prompt with the notes after it, or nothing to apply. */
export function primaryAction(outcome: Outcome): 'rewrite' | 'notes' | 'none' {
  if (outcome.rewrite !== '') {
    return 'rewrite'
  }

  return outcome.additions.length > 0 ? 'notes' : 'none'
}

/**
 * The prompt 1 sends and 3 puts back in the box: the rewrite, or the prompt
 * as typed with the notes after it; '' when there is neither. The person
 * reads it on the card before choosing it, so the notes go out as their own
 * words, not as notes only Claude reads.
 */
export function suggestedPrompt(outcome: Outcome): string {
  const action = primaryAction(outcome)
  if (action === 'rewrite') {
    return outcome.rewrite
  }
  if (action === 'notes') {
    return `${outcome.original.trimEnd()}\n\n${outcome.additions.map(addition => addition.text).join('\n')}`
  }

  return ''
}

/** What the review found, in plain words: the failed checks first, then the wording worth changing. */
function tipsOf(outcome: Outcome, s: Strings): string[] {
  const { review } = outcome
  const tips: string[] = []
  for (const id of CHECK_ORDER) {
    const check = review.checks[id]
    if (check.status === 'fail') {
      tips.push(check.note === '' ? s.checkHints[id] : check.note)
    }
  }
  // A low-confidence finding is a hunch: it is in `/prompt-coach last`, not on the card.
  const findings = review.findings
    .filter(finding => finding.confidence !== 'low')
    .sort((a, b) => rank(a.confidence) - rank(b.confidence))
  for (const finding of findings) {
    const tip = s.tipFinding(cut(finding.evidence, MAX_EVIDENCE), finding.why, finding.suggestion)
    if (tip !== '') {
      tips.push(tip)
    }
  }

  return tips
}

/** The typed prompt as one short line: it goes out whole, so the card shows its start. */
function keptLine(original: string, s: Strings): string {
  const text = original.trim()
  const shown = cut(text.split('\n')[0] ?? '', MAX_KEPT)

  return shown === text ? shown : `${shown} ${s.keptRest}`
}

/** The card as lines of text, top to bottom. Drawing and sizing both read this. */
export function cardLines(held: Held, s: Strings): CardLine[] {
  const { outcome } = held
  // A pane's title bar names the coach already; the band has nothing around it that does.
  // An effort level not yet seen is left out: the default it would show may not be the one in force.
  const title = [
    held.where === 'band' ? s.name : undefined,
    held.modelLabel,
    outcome.isEffortAssumed ? undefined : `effort ${outcome.effort}`,
    s.scoreLabel(outcome.score),
  ]
    .filter((part): part is string => part !== undefined)
    .join(' · ')
  const lines: CardLine[] = [{ tone: 'title', text: title }]
  if (outcome.profileId === 'generic') {
    lines.push({ tone: 'dim', text: s.unknownModel })
  }

  const tips = tipsOf(outcome, s)
  if (tips.length > 0) {
    lines.push({ tone: 'tipsLabel', text: s.tipsLabel })
    for (const tip of tips.slice(0, MAX_TIPS)) {
      lines.push({ tone: 'tip', text: `· ${tip}` })
    }
    if (tips.length > MAX_TIPS) {
      lines.push({ tone: 'more', text: s.tipsMore(tips.length - MAX_TIPS) })
    }
  }

  const { effort } = outcome.review
  if (effort.advice !== 'keep') {
    lines.push({ tone: 'effort', text: s.labelled(effort.advice === 'lower' ? s.effortLower : s.effortRaise, effort.why) })
  }

  const action = primaryAction(outcome)
  if (action !== 'none') {
    lines.push({ tone: 'promptLabel', text: s.promptLabel })
  }
  if (action === 'rewrite') {
    for (const row of cut(outcome.rewrite, MAX_REWRITE).split('\n')) {
      // A blank row stays a row: an empty text would draw nothing.
      lines.push({ tone: 'new', text: row === '' ? ' ' : row })
    }
  } else if (action === 'notes') {
    lines.push({ tone: 'kept', text: keptLine(outcome.original, s) })
    for (const addition of outcome.additions) {
      lines.push({ tone: 'new', text: addition.text })
    }
  }

  return lines
}

function rank(confidence: string): number {
  return confidence === 'high' ? 0 : confidence === 'medium' ? 1 : 2
}

/** Columns a text takes on a terminal: wide characters count as two. */
export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    width += code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6)) ? 2 : 1
  }

  return width
}

/** The rows the card needs at a width, the choices and any countdown included: what the pane is asked to open at. */
export function cardRows(lines: readonly CardLine[], columns: number, hasCountdown = false): number {
  const room = Math.max(20, columns)
  const body = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(displayWidth(line.text) / room)), 0)

  return body + 2 + (hasCountdown ? 1 : 0)
}

type Table = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

// Each tone's Text props. Only the props a tone sets are present: none is passed as undefined.
const TONES: Record<CardLine['tone'], { color?: string; bold?: boolean; dimColor?: boolean }> = {
  title: { bold: true },
  tipsLabel: { bold: true, color: 'yellow' },
  tip: {},
  more: { dimColor: true },
  effort: { color: 'cyan' },
  promptLabel: { bold: true, color: 'green' },
  kept: { dimColor: true },
  new: { color: 'green' },
  dim: { dimColor: true },
}

/** The card, for a pane or for the band above the prompt. */
export function drawCard(t: Table, held: Held, s: Strings) {
  const { Box, Text, Button } = t
  const decide = (choice: Decision) => () => {
    if (held.decision === null) {
      held.decision = choice
    }
  }
  const action = primaryAction(held.outcome)
  // The focus starts on the first choice there is. `autoFocus` takes `true` alone.
  const original =
    action === 'none' ? (
      <Button key="original" label={s.sendOriginal} hotkey="2" plain autoFocus onPress={decide('original')} />
    ) : (
      <Button key="original" label={s.sendOriginal} hotkey="2" plain onPress={decide('original')} />
    )

  const [title, ...details] = cardLines(held, s)

  // The choices sit right under the title: the focus starts there, so a card
  // taller than its pane opens at its top and scrolls down to the details.
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text key="title" wrap="wrap" bold>
        {title?.text ?? s.name}
      </Text>
      <Box key="choices" columnGap={2} flexWrap="wrap">
        {action === 'none' ? null : <Button key="apply" label={s.applyPrompt} hotkey="1" plain autoFocus onPress={decide('apply')} />}
        {original}
        <Button key="edit" label={s.editInBox} hotkey="3" plain onPress={decide('edit')} />
        <Button key="cancel" label={s.cancel} hotkey="4" plain onPress={decide('cancel')} />
        {held.where === 'pane' ? <Text dimColor>{s.escHint}</Text> : null}
      </Box>
      {held.secondsLeft === undefined ? null : (
        <Text key="countdown" dimColor>
          {s.autoSendIn(held.secondsLeft)}
        </Text>
      )}
      <Box key="details" flexDirection="column" marginTop={1}>
        {details.map((line, index) => (
          <Text key={`line-${index}`} wrap="wrap" {...TONES[line.tone]}>
            {line.text}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
