import type { ModelProfile } from './types'

export const fable52: ModelProfile = {
  id: 'claude-fable-5-2',
  label: 'Fable 5.2',
  matches: /fable-5-2|mythos-5-2|fable 5\.2|^fable(\[|$)/i,
  aliases: ['fable'],
  claudeCodeDefaultEffort: 'medium',
  apiDefaultEffort: 'high',
  // A bare "continue" is worth a review on this model, however short.
  reviewShortOn: ['bare_continue'],
  sources: [
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices',
    'https://code.claude.com/docs/en/model-config',
    'Claude Code claude-api skill: shared/model-migration.md (Migrating to Claude Fable 5.2), shared/prompt-audit.md',
  ],
  verified: '2026-11-11',
  notes: `Claude Fable 5.2. It follows instructions closely and literally.
- bare_continue: Anthropic's guidance for this model is to say what is approved instead of sending a bare "continue" ("Yes, run the migration on the staging database"). When the prompt is only a go-ahead and the assistant's last message proposed specific next steps, raise this finding (high). In "suggestion", write a go-ahead that names those steps in the assistant's own words. Name only what the assistant proposed; never widen what is approved, and never approve a step the assistant marked as risky unless the person's words cover it. When the assistant proposed nothing specific, do not raise it.
- ownership_scope_conflict: a line saying the codebase is the model's own ("this codebase is yours") makes it merge repeated code and make changes nobody asked for, at about 1.5 times the output tokens in Anthropic's tests, and a scope rule elsewhere in the prompt does not cancel it. If the prompt carries both such a line and a request to change as little as possible, flag the conflict (high) and suggest dropping the ownership line.
- absolute_rule: an absolute rule ("never", "always", "一律", "絕不") with no scope or reason is applied as written and can hold back routine work or lead to approvals nobody needs. Flag it (medium) and suggest stating its scope, its reason and its exception inside the rule. Leave alone a rule that carries its reason or guards a risky or irreversible action.
- think_less: at medium effort and above such a line does not stop the model thinking. Use action "effort": remove the line and lower the effort level.
- no_lazy: on this model, plain text asking it to finish the whole task is useful at low and medium effort, where it more often stops early with a list of what remains. Do not flag a calm "finish the whole task". Flag insults and shouting as pressure instead.
- numeric_cap: hard style rules ("one instruction per sentence, in 20 words or fewer") can make its prose choppy. Effort barely changes how long its replies are, so length belongs in the prompt, described by audience and purpose.
- A request for a report, summary or handoff that does not say who will read it: fail the context check and say which reader and which details are missing.`,
  effortGuide: {
    low: 'For quick back-and-forth and well-specified tasks. On long multistep work it is more likely to stop early with a list of what remains.',
    medium: 'For interactive coding, chat and everyday knowledge work. On long multistep work it stops early more often than at high.',
    high: 'For hard coding, research, agentic work and long unattended runs. It thinks before almost every reply, a greeting included, so easy turns are slower here.',
    xhigh: 'Only for the hardest long-running coding and agentic work where a gain has been measured: slightly higher scores for many more tokens.',
    max: 'For measuring the ceiling, or the rare open-ended problem where time and tokens do not matter.',
  },
}
