// The values Prompt Coach keeps between reloads of its module.

/**
 * What `/prompt-coach` switched for this session. Kept in the plugin's store,
 * one entry per session, so a reload of the module (a changed option, an
 * update) does not undo it.
 */
export type Override = {
  mode: 'coach' | 'auto' | 'off'
  autoStyle: 'append' | 'rewrite'
}
