// The English build, prompt-coach-en. Everything it shares with the
// Traditional Chinese build (register.tsx) is in coach.tsx.

import type { Register } from 'claude-code'

import { coach } from './coach'

export const register: Register = (on, pluginOptions) => {
  coach(on, pluginOptions, 'en')
}
