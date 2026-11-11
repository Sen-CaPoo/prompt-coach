import type { PluginOptions } from 'claude-code'

import type { AutoStyle, Backend, Engine, Mode, Settings } from './types'

const MODES: readonly Mode[] = ['coach', 'auto', 'off']
const STYLES: readonly AutoStyle[] = ['append', 'rewrite']
const BACKENDS: readonly Backend[] = ['session', 'api_key']
const ENGINES: readonly Engine[] = ['fork', 'complete']

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.min(max, Math.max(min, value))
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

/** The manifest's `userConfig` values as the settings the mod runs under. */
export function readSettings(options: PluginOptions | undefined): Settings {
  const o = options ?? {}

  return {
    mode: oneOf(o.mode, MODES, 'coach'),
    autoStyle: oneOf(o.auto_style, STYLES, 'append'),
    passScore: numberIn(o.pass_score, 0, 100, 85),
    backend: oneOf(o.backend, BACKENDS, 'session'),
    engine: oneOf(o.engine, ENGINES, 'fork'),
    forkEffort: oneOf(o.fork_effort, ['low', 'session'] as const, 'low'),
    reviewModel: text(o.review_model, 'session'),
    apiKey: text(o.api_key, ''),
    apiBaseUrl: text(o.api_base_url, 'https://api.anthropic.com').replace(/\/+$/, ''),
    timeoutMs: numberIn(o.timeout_seconds, 5, 120, 25) * 1000,
    minChars: numberIn(o.min_chars, 0, 2000, 8),
    forkMaxTokens: numberIn(o.fork_max_tokens, 1000, 2_000_000, 200_000),
    isHeadlessIncluded: o.headless === true,
    autoSendMs: Math.round(numberIn(o.auto_send_seconds, 0, 600, 60)) * 1000,
  }
}

/**
 * What `/prompt-coach <word>` changes for this session, or null when the word
 * is not a setting. The saved defaults live in the plugin's configuration.
 */
export function applyCommandWord(settings: Settings, word: string): Settings | null {
  switch (word) {
    case 'coach':
    case 'on':
      return { ...settings, mode: 'coach' }
    case 'auto':
      return { ...settings, mode: 'auto' }
    case 'off':
      return { ...settings, mode: 'off' }
    case 'append':
      return { ...settings, mode: 'auto', autoStyle: 'append' }
    case 'rewrite':
      return { ...settings, mode: 'auto', autoStyle: 'rewrite' }
    default:
      return null
  }
}
