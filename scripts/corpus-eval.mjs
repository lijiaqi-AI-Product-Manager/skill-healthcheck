// Runs the change-impact rules over research/upstream-changes.jsonl: 74 real SKILL.md
// changes from 15 public repos. Fetches both versions from GitHub (cached in
// research/.cache) and reports, per labelled change type, how often a rule fired.
// Usage: npm run build && node scripts/corpus-eval.mjs [--os windows|macos|linux] [--show <code>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkillText } from '../dist/frontmatter.js'
import { assessImpact } from '../dist/impact.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'research', '.cache')
const args = process.argv.slice(2)
const os = args.includes('--os') ? args[args.indexOf('--os') + 1] : 'windows'
const show = args.includes('--show') ? args[args.indexOf('--show') + 1] : undefined

const records = readFileSync(join(root, 'research', 'upstream-changes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))

async function raw(repo, sha, path) {
  if (!path) return null
  const file = join(cacheDir, repo.replace('/', '__'), sha, `${path.replaceAll('/', '__')}.md`)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${path}/SKILL.md`)
  if (!res.ok) return null
  const text = await res.text()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
  return text
}

// labelled type -> rule codes that count as "caught it"
const EXPECT = {
  'description-changed': ['description-changed', 'upstream-invalid'],
  'name-changed': ['name-changed', 'upstream-invalid'],
  'scripts-added': ['scripts-added'],
  'body-grew': ['body-grew'],
  'platform-specific': ['platform-specific'],
  'dir-renamed': ['moved-in-repo', 'name-changed'],
}

const stats = {}
const fired = {}
let evaluated = 0
let unparsableBefore = 0
for (const r of records) {
  if (!r.path_after) continue // deletions are an upstream-liveness case, not an impact case
  const [beforeRaw, afterRaw] = await Promise.all([raw(r.repo, r.commit_before, r.path_before), raw(r.repo, r.commit_after, r.path_after)])
  if (!beforeRaw || !afterRaw) continue
  const before = parseSkillText(beforeRaw)
  if (!before.ok) {
    unparsableBefore++
    continue
  }
  evaluated++
  const prefix = `${r.path_after}/scripts/`
  const added = r.scripts_added.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length))
  const findings = assessImpact({
    name: before.skill.name,
    before: before.skill,
    after: parseSkillText(afterRaw),
    scripts: { added, changed: [], removed: [] },
    catalogMaxLength: 500,
    os,
    movedTo: r.path_before !== r.path_after ? r.path_after : undefined,
  })
  const codes = new Set(findings.map((f) => f.code))
  for (const f of findings) {
    const key = `${f.code} (${f.severity})`
    fired[key] = (fired[key] ?? 0) + 1
  }
  for (const t of r.change_types) {
    if (!EXPECT[t]) continue
    const s = (stats[t] ??= { labelled: 0, caught: 0, missed: [] })
    s.labelled++
    if (EXPECT[t].some((c) => codes.has(c))) s.caught++
    else s.missed.push(`${r.repo}/${r.path_after}@${r.commit_after.slice(0, 7)}`)
  }
  if (show && codes.has(show)) {
    console.log(`\n${r.repo} ${r.path_after} ${r.commit_after.slice(0, 7)} [${r.change_types}]`)
    for (const f of findings.filter((f) => f.code === show)) console.log(`  ${f.message}\n    ${(f.detail ?? []).join('\n    ')}`)
  }
}

console.log(`\nevaluated ${evaluated} changes (os=${os}; skipped ${unparsableBefore} whose old version was already invalid)`)
console.log('\nrecall by labelled type:')
for (const [t, s] of Object.entries(stats)) {
  console.log(`  ${t.padEnd(20)} ${s.caught}/${s.labelled}${s.missed.length ? `   missed: ${s.missed.slice(0, 3).join(', ')}` : ''}`)
}
console.log('\nrules fired (records):')
for (const [c, n] of Object.entries(fired).sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(26)} ${n}`)
