import type { LintHit } from './types'

/**
 * The instant scan: wording that Anthropic's prompt-audit guide lists as
 * dated on current models, found by pattern before any model call.
 *
 * A hit is a candidate, not a verdict. The reviewer confirms it in context
 * (a MUST inside pasted code is not pressure language), and a hit alone
 * never changes a prompt.
 *
 * Source: the "Signals" rows of shared/prompt-audit.md in Claude Code's
 * claude-api skill (Group 1, dated prompt text), with Chinese equivalents.
 */
type Pattern = {
  id: string
  test: RegExp
}

const PATTERNS: readonly Pattern[] = [
  // 1b-1: thinking incantations
  {
    id: 'think_incantation',
    test: /think (it )?(through )?step[- ]by[- ]step|take a deep breath|think (very )?(hard|carefully|deeply)|一步一步(地|的)?(想|思考|推理|分析)|逐步(思考|推理)|仔細(地)?(想|思考)(清楚|一下)?|深呼吸|好好想(一想|清楚)/i,
  },
  // 1b-3: prose that tries to set thinking depth
  {
    id: 'think_less',
    test: /don'?t overthink|do not overthink|think less|without (deliberating|thinking)|answer (directly|immediately|right away)|no need to think|不要想太多|別想太多|不用想太多|不要思考|直接回答(就好)?|不用多想|快速回答/i,
  },
  // 1b-4: reasoning written into the reply
  {
    id: 'show_reasoning',
    test: /show (me )?your (thinking|reasoning|work|chain of thought)|(write|print|output|include) (out )?your (full |whole |complete )?(reasoning|thinking|thought process)|explain your (reasoning|thinking) step by step|<(thinking|scratchpad)>|把(你的)?(推理|思考|思路)(過程)?(都)?(寫|列|說|印)出來|(寫|列|說|印)出(你的)?(完整)?(推理|思考)(過程)?|展示(你的)?(推理|思考)過程/i,
  },
  // 1a-4: laziness and persistence pressure
  {
    id: 'no_lazy',
    test: /do not be lazy|don'?t be lazy|be thorough|do not stop early|don'?t stop early|不要偷懶|別偷懶|不准偷懶|不要敷衍/i,
  },
  // 1d-2: tool-use discouragement
  {
    id: 'tool_discouraged',
    test: /only use tools (when|if) (strictly |absolutely )?necessary|minimi[sz]e tool (calls|use)|avoid (using )?tools|(盡量|儘量)(少|不要|別)用工具|少用工具|不要用工具|別用工具|減少工具(呼叫|使用)/i,
  },
  // 1d-9: update suppressors
  {
    id: 'hold_updates',
    test: /hold (all )?(findings|results|updates)|don'?t narrate|no interim updates|(先|中途)不要(回報|報告|說明)|最後再(一起|一次)?(說|回報|報告)|過程(中)?不要(回報|說明|輸出)/i,
  },
  // 1b-6 / 1f: numeric caps and fixed cadences
  {
    id: 'numeric_cap',
    test: /(at most|no more than|under|within|maximum of|max) \d+ (words|sentences|bullets|lines|paragraphs)|in \d+ words or (fewer|less)|every \d+ (tool calls|steps|messages)|(不超過|最多|限制在|控制在)\s*\d+\s*(個)?(字|句|行|點|段)|\d+\s*(個)?字以內|每\s*\d+\s*(次|個)(工具呼叫|步驟)/i,
  },
  // 1c-6: grader vocabulary
  {
    id: 'grader_talk',
    test: /you will be (graded|scored|evaluated)|hidden tests?|this is a test of your|你會被(評分|打分)|這是(一個)?測驗|隱藏測試/i,
  },
]

const SHOUT = /\b(MUST|NEVER|ALWAYS|CRITICAL|IMPORTANT|MANDATORY|DO NOT|NO EXCEPTIONS)\b/g
const BANGS = /[!！]{2,}/g
const ZH_SHOUT = /(務必|絕對不(可|能|要|准)|一定要|千萬不(可|能|要)|嚴禁)/g

/** A bare go-ahead: the whole prompt is a word or two of approval. */
const BARE_CONTINUE = /^\s*(please\s+)?(continue|go on|go ahead|go|proceed|carry on|keep going|ok(ay)?|yes|yep|sure|do it|lgtm|繼續|請繼續|繼續吧|好|好的|好啊|可以|可以的|行|沒問題|ok 繼續|對|是|是的|做吧|開始吧|去做吧)\s*[.!。！~～]*\s*$/i

/** Fenced code is content, not instruction: the scan skips it. */
function withoutCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')
}

export function isBareContinuation(text: string): boolean {
  const short = text.trim()

  // The length test comes first: the pattern is slow on a long run of spaces.
  return short.length <= 40 && BARE_CONTINUE.test(short)
}

export function lintPrompt(text: string): LintHit[] {
  const body = withoutCode(text)
  const hits: LintHit[] = []

  for (const pattern of PATTERNS) {
    const found = pattern.test.exec(body)
    if (found !== null) {
      hits.push({ id: pattern.id, evidence: found[0] })
    }
  }

  // 1a: pressure language counts only when it piles up.
  const shouts = [...(body.match(SHOUT) ?? []), ...(body.match(ZH_SHOUT) ?? [])]
  const bangs = body.match(BANGS) ?? []
  if (shouts.length >= 2 || bangs.length >= 1) {
    hits.push({ id: 'pressure', evidence: [...shouts, ...bangs].slice(0, 4).join(' ') })
  }

  if (isBareContinuation(text)) {
    hits.push({ id: 'bare_continue', evidence: text.trim() })
  }

  return hits
}
