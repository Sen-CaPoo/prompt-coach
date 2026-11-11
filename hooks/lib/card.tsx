import type { Elements } from 'claude-code'

import { tally } from './score'
import type { Strings } from './strings'
import type { CheckId, Outcome } from './types'

export type Decision = 'apply' | 'original' | 'edit' | 'cancel' | 'timeout' | 'interrupted'

/** A prompt held while the person decides. */
export type Held = {
  outcome: Outcome
  modelLabel: string
  where: 'pane' | 'band'
  decision: Decision | null
  /** Set while drawing: the person has the band folded away, so the card cannot be seen there. */
  isBandCollapsed: boolean
}

export type CardLine = {
  tone: 'title' | 'fail' | 'finding' | 'effort' | 'label' | 'minus' | 'plus' | 'note' | 'dim'
  text: string
}

const CHECK_ORDER: readonly CheckId[] = ['goal', 'reference', 'done', 'scope', 'context']
const MAX_FINDINGS = 3
const MAX_ORIGINAL = 300
const MAX_REWRITE = 1200

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** What 1 does on this card: use the rewrite, attach the notes, or nothing to apply. */
export function primaryAction(outcome: Outcome): 'rewrite' | 'notes' | 'none' {
  if (outcome.rewrite !== '') {
    return 'rewrite'
  }

  return outcome.additions.length > 0 ? 'notes' : 'none'
}

/** The card as lines of text, top to bottom. Drawing and sizing both read this. */
export function cardLines(held: Held, s: Strings): CardLine[] {
  const { outcome } = held
  const { review } = outcome
  const { applicable, passed } = tally(review)
  const lines: CardLine[] = [
    { tone: 'title', text: s.cardTitle(held.modelLabel, outcome.effort, outcome.score, passed, applicable) },
  ]
  if (outcome.isEffortAssumed) {
    lines.push({ tone: 'dim', text: s.effortAssumed })
  }
  if (outcome.profileId === 'generic') {
    lines.push({ tone: 'dim', text: s.unknownModel })
  }

  for (const id of CHECK_ORDER) {
    const check = review.checks[id]
    if (check.status === 'fail') {
      lines.push({ tone: 'fail', text: `${s.checks[id]}：${check.note}` })
    }
  }

  const findings = [...review.findings]
    .sort((a, b) => rank(a.confidence) - rank(b.confidence))
    .slice(0, MAX_FINDINGS)
  for (const finding of findings) {
    const fix = finding.suggestion === '' ? finding.why : `${finding.why} → ${finding.suggestion}`
    lines.push({ tone: 'finding', text: `${s.findingsLabel}「${cut(finding.evidence, 40)}」：${fix}` })
  }

  if (review.effort.advice !== 'keep') {
    const label = review.effort.advice === 'lower' ? s.effortLower : s.effortRaise
    lines.push({ tone: 'effort', text: `${label}：${review.effort.why}` })
  }

  const action = primaryAction(outcome)
  if (action === 'rewrite') {
    lines.push({ tone: 'label', text: s.suggestedLabel })
    lines.push({ tone: 'minus', text: `- ${cut(outcome.original.trim(), MAX_ORIGINAL)}` })
    for (const row of cut(outcome.rewrite, MAX_REWRITE).split('\n')) {
      lines.push({ tone: 'plus', text: `+ ${row}` })
    }
  } else if (action === 'notes') {
    lines.push({ tone: 'label', text: s.notesLabel })
    for (const addition of outcome.additions) {
      lines.push({ tone: 'note', text: `· ${s.additions[addition.kind]}：${addition.text}` })
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

/** The rows the card needs at a width, buttons included: what the pane is asked to open at. */
export function cardRows(lines: readonly CardLine[], columns: number): number {
  const room = Math.max(20, columns)
  const body = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(displayWidth(line.text) / room)), 0)

  return body + 2
}

type Table = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

// Each tone's Text props. Only the props a tone sets are present: none is passed as undefined.
const TONES: Record<CardLine['tone'], { color?: string; bold?: boolean; dimColor?: boolean }> = {
  title: { bold: true },
  fail: { color: 'yellow' },
  finding: { color: 'yellow' },
  effort: { color: 'cyan' },
  label: { bold: true },
  minus: { color: 'red' },
  plus: { color: 'green' },
  note: {},
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
        {action === 'none' ? null : (
          <Button key="apply" label={action === 'rewrite' ? s.applyRewrite : s.applyNotes} hotkey="1" plain autoFocus onPress={decide('apply')} />
        )}
        {original}
        <Button key="edit" label={s.editInBox} hotkey="3" plain onPress={decide('edit')} />
        <Button key="cancel" label={s.cancel} hotkey="4" plain onPress={decide('cancel')} />
        {held.where === 'pane' ? <Text dimColor>{s.escHint}</Text> : null}
      </Box>
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
