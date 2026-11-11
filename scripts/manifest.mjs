// Writes .claude-plugin/plugin.json from one build's marketplace entry, for
// `claude plugin test .` and `claude --plugin-dir .`:
//
//   node scripts/manifest.mjs        the Traditional Chinese build, prompt-coach
//   node scripts/manifest.mjs en     the English build, prompt-coach-en
//
// The file is not committed. Each build's manifest lives in its marketplace
// entry (strict: false), and Claude Code reads a plugin.json in the folder in
// preference to it, so a committed one would give both builds the same screens.
//
// It also checks that the two builds differ in words only.

import { readFileSync, writeFileSync } from 'node:fs'

const BUILDS = { zh: 'prompt-coach', en: 'prompt-coach-en' }
/** Everything but the words: the two builds must agree on these. */
const SHARED = ['version', 'license', 'types', 'keywords']
const FIELD_SHARED = ['type', 'default', 'options', 'min', 'max', 'sensitive', 'required', 'multiple']

const which = process.argv[2] ?? 'zh'
if (!Object.hasOwn(BUILDS, which)) {
  console.error(`Unknown build "${which}". Use: ${Object.keys(BUILDS).join(' or ')}.`)
  process.exit(1)
}

const marketUrl = new URL('../.claude-plugin/marketplace.json', import.meta.url)
const market = JSON.parse(readFileSync(marketUrl, 'utf8'))
const entry = name => market.plugins.find(p => p.name === name)
const zh = entry(BUILDS.zh)
const en = entry(BUILDS.en)

const problems = []
if (zh === undefined || en === undefined) {
  problems.push(`marketplace.json needs both ${BUILDS.zh} and ${BUILDS.en}`)
} else {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  for (const key of SHARED) {
    if (!same(zh[key], en[key])) problems.push(`${key} differs`)
  }
  const fields = [...new Set([...Object.keys(zh.userConfig ?? {}), ...Object.keys(en.userConfig ?? {})])]
  for (const field of fields) {
    const a = zh.userConfig?.[field]
    const b = en.userConfig?.[field]
    if (a === undefined || b === undefined) {
      problems.push(`userConfig.${field} is in one build only`)
      continue
    }
    for (const key of FIELD_SHARED) {
      if (!same(a[key], b[key])) problems.push(`userConfig.${field}.${key} differs`)
    }
  }
}
if (problems.length > 0) {
  console.error(`The two builds must differ in words only:\n- ${problems.join('\n- ')}`)
  process.exit(1)
}

const { source, strict, ...manifest } = entry(BUILDS[which])
writeFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote .claude-plugin/plugin.json for ${manifest.name} ${manifest.version}.`)
