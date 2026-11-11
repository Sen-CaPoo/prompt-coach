// The values Prompt Coach keeps in the session's state.

/**
 * What `/prompt-coach` switched for this session. Kept in session state so a
 * reload of the module (a changed option, an update) does not undo it.
 */
export type Override = {
  mode: 'coach' | 'auto' | 'off'
  autoStyle: 'append' | 'rewrite'
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-coach': { override: Override | null }
  }
}
