import type { EngineInterface } from 'claude-code'

/**
 * Waiting for a person without spending the hook's budget.
 *
 * A hook has ten seconds of its own time, but time inside a `$` call is not
 * counted, so the wait is a short host command, as Anthropic's Blast Radius
 * example does it. `sleep` is there on macOS, Linux and under Git Bash;
 * plain Windows has `ping` and PowerShell. The first one that really waits
 * is remembered for the session.
 */
type Method = 'sleep' | 'ping' | 'powershell'

const COMMANDS: Record<Method, readonly string[]> = {
  sleep: ['sleep', '0.25'],
  // TEST-NET-1 never answers, so this returns when its 250 ms timeout runs out.
  ping: ['ping', '-n', '1', '-w', '250', '192.0.2.1'],
  powershell: ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Milliseconds 250'],
}
const ORDER: readonly Method[] = ['sleep', 'ping', 'powershell']

/** A command that returns sooner than this did not wait: it failed fast. */
const MIN_WAIT_MS = 100

let method: Method | 'none' | undefined

async function attempt($: EngineInterface, argv: readonly string[]): Promise<boolean> {
  const startedAt = await $.clock.now()
  try {
    await $.process.run(argv, { timeoutMs: 5000 })
  } catch {
    return false
  }

  return (await $.clock.now()) - startedAt >= MIN_WAIT_MS
}

/**
 * Waits about a quarter of a second. Resolves false when this machine has no
 * command to wait with, so the caller can ask through the engine's own dialog.
 */
export async function pause($: EngineInterface): Promise<boolean> {
  if (method === 'none') {
    return false
  }
  if (method !== undefined && (await attempt($, COMMANDS[method]))) {
    return true
  }
  for (const candidate of ORDER) {
    if (await attempt($, COMMANDS[candidate])) {
      method = candidate

      return true
    }
  }
  method = 'none'

  return false
}
