import { fable52 } from './claude-fable-5-2'
import { haiku55 } from './claude-haiku-5-5'
import { opus55 } from './claude-opus-5-5'
import { sonnet55 } from './claude-sonnet-5-5'
import { generic } from './common'
import type { ModelProfile } from './types'

export { COMMON_RULES, generic } from './common'
export type { ModelProfile } from './types'

/**
 * Every model the coach has rules for. To add one: write its profile in a
 * new file beside these and list it here.
 */
export const PROFILES: readonly ModelProfile[] = [opus55, fable52, sonnet55, haiku55]

/** The profile for the session's model string, or the generic one. */
export function resolveProfile(model: string): ModelProfile {
  return PROFILES.find(profile => profile.matches.test(model)) ?? generic
}

/**
 * The model a `review_model` setting names. "session" is the session's own
 * model: as the session spells it for a call through the session, since a
 * cloud provider has ids of its own, and as the first-party id for the
 * Messages API. An alias is that family's current model; anything else is
 * taken as a model id.
 */
export function resolveReviewModel(setting: string, sessionModel: string, isForApi: boolean): string {
  const wanted = setting.trim().toLowerCase()
  if (wanted === '' || wanted === 'session') {
    if (!isForApi) {
      return sessionModel
    }
    // `opus[1m]` and the like name a context window, not another model.
    const plain = sessionModel.replace(/\[.*\]$/, '')
    if (plain.startsWith('claude-')) {
      return plain
    }
    const profile = resolveProfile(plain)

    return profile.id === 'generic' ? plain : profile.id
  }
  const profile = PROFILES.find(candidate => candidate.aliases.includes(wanted))
  if (profile === undefined) {
    return setting.trim()
  }

  // Through the session an alias is resolved by Claude Code, for whichever provider it runs on.
  return isForApi ? profile.id : wanted
}
