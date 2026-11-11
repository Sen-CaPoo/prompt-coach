// The Traditional Chinese build, prompt-coach. Everything it shares with the
// English build (register.en.tsx) is in coach.tsx.

import type { Register } from 'claude-code'

import { coach } from './coach'

export const register: Register = (on, pluginOptions) => {
  coach(on, pluginOptions, 'zh-TW')
}
