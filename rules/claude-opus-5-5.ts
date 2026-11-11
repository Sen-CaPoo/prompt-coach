import type { ModelProfile } from './types'

export const opus55: ModelProfile = {
  id: 'claude-opus-5-5',
  label: 'Opus 5.5',
  matches: /opus-5-5|opus 5\.5|^opus(\[|$)/i,
  aliases: ['opus'],
  claudeCodeDefaultEffort: 'medium',
  apiDefaultEffort: 'medium',
  reviewShortOn: [],
  sources: [
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5',
    'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices',
    'https://code.claude.com/docs/en/model-config',
    'Claude Code claude-api skill: shared/model-migration.md (Migrating to Claude Opus 5.5), shared/prompt-audit.md',
  ],
  verified: '2026-11-11',
  notes: `Claude Opus 5.5.
- verify_scaffold: this model checks its own work without being told. A line such as "double-check your answer", "re-verify before responding" or "add a final verification step" causes extra verification work. Flag it (medium; Anthropic states this for Claude Opus 5 and keeps it as the starting point for Opus 5.5) and suggest removing it. A concrete check the person names ("run npm test -- LoginForm") is a done-criterion, not scaffolding: keep it, and never suggest adding a generic verification line.
- think_less: at low effort a line like "answer directly" can cut thinking a little further, at some cost in accuracy. At medium and above the reliable lever is the effort level. Use action "effort".
- no_lazy: suggest removing it; the model is proactive by default.
- Scope: Claude Opus 5 tends to widen a narrowly scoped task. When a prompt that changes things gives no scope, fail the scope check and say so. Do not write a scope for the person.
- frontend_no_direction: asked for frontend or visual design work with no design direction, the model falls back on a few default styles, and a general line such as "avoid a generic AI look" mostly swaps one default for another. Flag it (medium) and suggest the person name the look they want or the specific patterns to avoid. A list of named patterns to avoid is the form that works here: never turn such a list into positive phrasing or remove it.
- review_filter: a code-review prompt that says "only report high-severity issues" or "be conservative" is followed literally and reports less. Flag it (medium) and suggest asking for every finding with its severity and confidence, to be filtered afterwards.`,
  effortGuide: {
    low: 'Close to the default on several coding evaluations at much lower cost. Fits simple, well-specified turns and anything where waiting matters.',
    medium: 'The default. Matches or exceeds Claude Opus 5 at high on coding and knowledge work; fits day-to-day engineering with a clear scope.',
    high: 'For work where verification matters or edge cases are likely, such as a bug fix in an existing codebase.',
    xhigh: 'Reserve for work where a quality gain has been measured. Turns run longer and the model thinks more per turn than Claude Opus 5 did at this level.',
    max: 'Reserve for work where a quality gain has been measured. Slow and costly; not for routine turns.',
  },
}
