import type { ModelProfile } from './types'

export const haiku55: ModelProfile = {
  id: 'claude-haiku-5-5',
  label: 'Haiku 5.5',
  matches: /haiku-5-5|haiku 5\.5|^haiku(\[|$)/i,
  aliases: ['haiku'],
  claudeCodeDefaultEffort: 'medium',
  apiDefaultEffort: 'medium',
  reviewShortOn: [],
  sources: [
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices',
    'https://code.claude.com/docs/en/model-config',
    'Claude Code claude-api skill: shared/model-migration.md (Migrating to Claude Haiku 5.5), shared/prompt-audit.md',
  ],
  verified: '2026-11-11',
  notes: `Claude Haiku 5.5. Anthropic's page for this model says nothing about clarity, scope or over-engineering, so those are judged by the general checks alone.
- think_less: the model still thinks when told to answer directly. Use action "effort".
- Verification: at low and medium effort it sometimes reports a code change as done without running a check. When the prompt asks for a code change without naming a way to check it, fail the done check and say which real check is missing: the project's tests, type-checker or build, or running the changed command.
- blanket_search: a blanket instruction to search for every factual question made it search on about half of the prompts that needed none, in Anthropic's tests. Flag it (medium) and suggest naming the kind of fact to check: records, prices, versions, rules, anything "latest".
- A question about facts that change, with no request to check them: note in the context check that asking it to verify current facts would help. Do not add a search instruction yourself.
- show_reasoning: dated wording here too, though this model has no documented refusal for it.
- At low effort in a long coding session it sometimes stops early and hands the task back. That is an effort matter, not a wording one.`,
  effortGuide: {
    low: 'The cheapest and fastest level: chat, short tool tasks, simple high-volume requests. In a long agent session it is more likely to stop early or skip a check.',
    medium: 'The default. For most work, agentic coding included. It can still report a code change as done without running a check.',
    high: 'For knowledge work, longer agent tasks and strict instruction following.',
    xhigh: 'Only where a measured quality gain justifies the cost; compare against Claude Sonnet 5.5 first.',
    max: 'Only where a measured quality gain justifies the cost; compare against Claude Sonnet 5.5 first.',
  },
}
