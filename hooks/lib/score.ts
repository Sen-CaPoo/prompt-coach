import type { CheckId, Confidence, Review } from './types'

/**
 * The score is added up from the checklist, not asked of the model: the same
 * prompt scored as an overall impression came back anywhere from 8 to 35 in
 * testing. Each applicable check contributes its weight when it passes; each
 * confirmed finding takes a little off.
 */
export const CHECK_WEIGHTS: Record<CheckId, number> = {
  goal: 25,
  done: 25,
  reference: 20,
  scope: 15,
  context: 15,
}

const FINDING_PENALTY: Record<Confidence, number> = { high: 8, medium: 5, low: 0 }
const MAX_PENALTY = 30

export function scoreOf(review: Review): number {
  let applicable = 0
  let passed = 0
  for (const id of Object.keys(CHECK_WEIGHTS) as CheckId[]) {
    const status = review.checks[id].status
    if (status === 'na') {
      continue
    }
    applicable += CHECK_WEIGHTS[id]
    if (status === 'pass') {
      passed += CHECK_WEIGHTS[id]
    }
  }
  // A question or an exploration has nothing to fail: it starts from full marks.
  const base = applicable === 0 ? 100 : (100 * passed) / applicable
  const penalty = Math.min(
    MAX_PENALTY,
    review.findings.reduce((sum, finding) => sum + FINDING_PENALTY[finding.confidence], 0),
  )

  return Math.max(0, Math.min(100, Math.round(base - penalty)))
}
