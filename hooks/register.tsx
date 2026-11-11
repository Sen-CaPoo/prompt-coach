// The entry module of both builds, prompt-coach and prompt-coach-en. Each
// hook picks its interface language from the plugin's name; everything else
// is in coach.tsx.

import type { Register } from 'claude-code'

import { coach } from './coach'

export const register: Register = (on, pluginOptions) => {
  coach(on, pluginOptions)
}
