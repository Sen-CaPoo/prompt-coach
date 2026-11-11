import type { Effort } from '../hooks/lib/types'

/**
 * One model's rules. To support a new model, add a file that exports a
 * profile and list it in `rules/index.ts`; nothing else changes.
 */
export type ModelProfile = {
  /** The model id as the API names it, without date suffix. */
  id: string
  /** The name shown on the card. */
  label: string
  /** Tested against the session's model string (`claude-opus-5-5`, `opus[1m]`, ...). */
  matches: RegExp
  /** Short names that mean this model in the `review_model` setting. */
  aliases: readonly string[]
  /** The level the session starts at in Claude Code when nothing sets one. */
  claudeCodeDefaultEffort: Effort
  /** The level the API uses when a request names none. */
  apiDefaultEffort: Effort
  /** Instant-scan pattern ids that warrant a model review even of a very short prompt. */
  reviewShortOn: readonly string[]
  /** Where each rule comes from. */
  sources: readonly string[]
  /** When the rules were last checked against the sources. */
  verified: string
  /** Guidance for the reviewer: how this model behaves and what to suggest. */
  notes: string
  /** What each effort level is for on this model, and what goes wrong at it. */
  effortGuide: Record<Effort, string>
}
