import type { ModelProfile } from './types'

export const sonnet55: ModelProfile = {
  id: 'claude-sonnet-5-5',
  label: 'Sonnet 5.5',
  matches: /sonnet-5-5|sonnet 5\.5|^sonnet(\[|$)/i,
  aliases: ['sonnet'],
  claudeCodeDefaultEffort: 'medium',
  apiDefaultEffort: 'high',
  reviewShortOn: [],
  sources: [
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices',
    'https://code.claude.com/docs/en/model-config',
    'Claude Code claude-api skill: shared/model-migration.md (Migrating to Claude Sonnet 5.5), shared/prompt-audit.md',
  ],
  verified: '2026-11-11',
  notes: `Claude Sonnet 5.5. For the hardest long-horizon work Anthropic recommends an Opus model.
- no_lazy: Anthropic names "do not be lazy"-style lines for removal on this model. Suggest removing (high).
- tool_discouraged: it follows "only use tools when strictly necessary" literally and already tends to answer from its own knowledge when a tool would serve better. High confidence. If the prompt also asks about facts that change (versions, prices, rules, what is allowed), say that the two instructions pull against each other.
- open_request: given an open-ended ask ("show me what you can do with this", "想想看有什麼做法"), it may start building when the person only wanted ideas. When the prompt is exploratory and reads as wanting ideas, options or a plan, raise this (medium) and suggest saying so: give the options and stop; build nothing until told to.
- Scope: at every effort level it tends to add tests, docs and small helper files nobody asked for. When a prompt that changes things gives no scope, fail the scope check and say so. Do not write a scope for the person.
- think_less: from medium effort up a request to think less has almost no effect. Use action "effort".
- Verification: mostly at low effort it sometimes reports a code change as done without a check that exercises it. When the effort is low and the prompt asks for a code change without naming a way to check it, fail the done check and say which real check is missing: the project's tests, type-checker or build, or running the changed command.
- At low and medium effort, long agentic tasks more often pause to check in before finishing. That is an effort matter, not a wording one.`,
  effortGuide: {
    low: 'For chat, quick edits and search. It may skip verifying a change and, on long agentic tasks, stop to check in before finishing.',
    medium: 'For agentic coding and multistep tool use with a clear scope. Long tasks pause for confirmation more often than at high.',
    high: 'For harder or longer agentic tasks, and for work where waiting does not matter.',
    xhigh: 'It may start extra review rounds on its own and fix related issues it notices. Anthropic advises running routine work at high or below.',
    max: 'As xhigh, more so. Keep for work where a quality gain has been measured.',
  },
}
