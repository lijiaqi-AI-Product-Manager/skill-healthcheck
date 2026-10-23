// One test per bug found in the 1.0.1 external reviews: each of these was a wrong
// conclusion, a silent data loss, or a contract mismatch, so each one gets a guard.
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { usageFindings } from '../src/checks.js'
import { buildInventory } from '../src/discover.js'
import { parseSkillText } from '../src/frontmatter.js'
import { assessImpact, wordDiff } from '../src/impact.js'
import { Store } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { checkJson } from '../src/report.js'
import { catalogTimeline, loadSessions, type SessionSummary } from '../src/sessions.js'
import { isSafeGitUrl, redactUrl } from '../src/upstream.js'
import { matchSymptoms, why } from '../src/why.js'
import { gitRun, sandbox, skillMd, upstreamRepo, write } from './helpers.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T10:00:00Z')

type Box = ReturnType<typeof sandbox>

const check = async (s: Box, store = new Store()) => (await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, store })).verdicts

function session(id: string, t: number, catalog: Record<string, string>, calls: string[] = []): SessionSummary {
  return {
    id,
    createdAt: t,
    catalogs: [{ t, entries: Object.entries(catalog).map(([name, description]) => ({ name, description })) }],
    skillCalls: calls.map((name) => ({ t: t + 1000, name, via: 'model' as const })),
    days: {},
  }
}

describe('session logs', () => {
  it('walks into workspace folders whose name contains a dot', () => {
    const s = sandbox()
    const dir = join(s.DSH_HOME, 'sessions')
    write(join(dir, 'ws.v2', 'sess1', 'session.v4.jsonl'), JSON.stringify({ type: 'session', version: 4, id: 'x', createdAt: T0 }))
    write(join(dir, 'my.project', 'sess2', 'session.v4.jsonl'), JSON.stringify({ type: 'session', version: 4, id: 'y', createdAt: T0 + DAY }))
    const sessions = loadSessions([{ dir, format: 'dsh' }], new Store())
    expect(sessions.map((x) => x.id).sort()).toEqual(['x', 'y'])
  })
})

describe('frontmatter', () => {
  it('accepts a UTF-8 BOM instead of reporting it as a missing frontmatter', () => {
    const parsed = parseSkillText(`\ufeff${skillMd({ name: 'a', description: 'b' })}`)
    expect(parsed.ok).toBe(true)
  })
})

describe('description rules', () => {
  it('treats word-form edits as rewording, not as lost triggers', () => {
    expect(wordDiff('Write articles', 'Write article')).toEqual({ removed: [], added: [] })
    expect(wordDiff('running the tests', 'run the tests')).toEqual({ removed: [], added: [] })
    expect(wordDiff('copies files', 'copy files')).toEqual({ removed: [], added: [] })
  })

  it('reports a swapped platform command, not only a newly introduced rule', () => {
    const findings = assessImpact({
      name: 'x',
      before: { name: 'x', description: 'List files with Get-ChildItem', invocation: { modelInvocable: true, userInvocable: true }, body: '' },
      after: { ok: true, skill: { name: 'x', description: 'List files with Get-Process', invocation: { modelInvocable: true, userInvocable: true }, body: '' } },
      os: 'linux',
    })
    expect(findings.map((f) => f.code)).toContain('platform-specific')
  })

  it('reports a description that grew a lot even without a known catalog limit', () => {
    const long = 'Write documents for users. '.repeat(20)
    const findings = assessImpact({
      name: 'x',
      before: { name: 'x', description: 'Write documents.', invocation: { modelInvocable: true, userInvocable: true }, body: '' },
      after: { ok: true, skill: { name: 'x', description: long, invocation: { modelInvocable: true, userInvocable: true }, body: '' } },
    })
    expect(findings.map((f) => f.code)).toContain('description-grew')
  })
})

describe('upstream comparison', () => {
  it('ignores a metadata-only edit (the field adopt recommends adding)', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': skillMd({ name: 'zh-writer', description: '写中文文档' }) })
    const local = `---\nname: zh-writer\ndescription: 写中文文档\nmetadata:\n  source: ${JSON.stringify(up.bare)}\n---\n# Skill\n\nDo the thing.\n`
    write(join(s.DSH_HOME, 'skills', 'zh-writer', 'SKILL.md'), local)
    const [v] = await check(s)
    expect(v!.upstream?.state).toBe('current')
    expect(v!.state).toBe('ok')
  })

  it('follows a skill that was renamed and largely rewritten', async () => {
    const s = sandbox()
    const store = new Store()
    const body = Array.from({ length: 12 }, (_, i) => `Step ${i}: do the thing carefully.`).join('\n')
    const up = upstreamRepo(s.root, { 'skills/old-name/SKILL.md': skillMd({ name: 'old-name', description: 'Write docs' }, `${body}\n`) })
    gitRun(s.root, 'clone', '-q', '-c', 'core.autocrlf=false', up.bare, join(s.root, 'checkout'))
    cpSync(join(s.root, 'checkout', 'skills', 'old-name'), join(s.DSH_HOME, 'skills', 'old-name'), { recursive: true })
    store.writeJsonFile('sources.json', { 'old-name': { url: up.bare, subpath: 'skills/old-name', adoptedAt: 0 } })
    up.commit(
      {
        'skills/old-name': null,
        'skills/new-name/SKILL.md': skillMd({ name: 'new-name', description: 'Write documents for the team' }, `${body}\nExtra detail that is new.\n`),
      },
      'rename and rewrite',
    )
    const [v] = await check(s, store)
    expect(v!.upstream).toMatchObject({ state: 'changed', movedTo: 'skills/new-name' })
    expect(v!.findings.map((f) => f.code)).toContain('name-changed')
  })

  it('does not call a broken local metadata.source a deleted repository', async () => {
    const s = sandbox()
    const missing = join(s.root, 'nope.git')
    write(join(s.DSH_HOME, 'skills', 'zh-writer', 'SKILL.md'), `---\nname: zh-writer\ndescription: 写中文文档\nmetadata:\n  source: ${JSON.stringify(missing)}\n---\n# Skill\n`)
    const [v] = await check(s)
    expect(v!.upstream?.state).toBe('unreachable')
    expect(v!.state).toBe('unchecked')
    expect(v!.findings.map((f) => f.code)).toEqual(['upstream-unreachable'])
  })

  it('redacts credentials before a source URL is printed or serialized', () => {
    expect(redactUrl('https://user:ghp_secret@github.com/o/r.git')).toBe('https://***@github.com/o/r.git')
    expect(isSafeGitUrl('ssh://-oProxyCommand=evil')).toBe(false)
    expect(isSafeGitUrl('git@-oProxyCommand=evil:x.git')).toBe(false)
  })
})

describe('went-quiet causality', () => {
  it('does not blame a description change that happened after the skill went unused', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'new text' }))
    const inventory = buildInventory(detectPlatform({ cwd: s.project }))
    const sessions = [
      session('a0', T0, { 'doc-writer': 'old text' }, ['doc-writer']),
      session('a1', T0 + DAY, { 'doc-writer': 'old text' }, ['doc-writer']),
      session('b0', T0 + 14 * DAY, { 'doc-writer': 'old text' }),
      session('b1', T0 + 15 * DAY, { 'doc-writer': 'new text' }),
      session('b2', T0 + 16 * DAY, { 'doc-writer': 'new text' }),
      session('b3', T0 + 17 * DAY, { 'doc-writer': 'new text' }),
    ]
    const findings = usageFindings(inventory, sessions, catalogTimeline(sessions))
    expect(findings).toMatchObject([{ code: 'went-quiet', severity: 'high' }])
  })
})

describe('why symptom matching', () => {
  it.each([
    ['它现在怎么不回复中文了', 'language'],
    ['最近老是说英文', 'language'],
    ['它不再调用我的技能了', 'skill-not-triggered'],
    ['回答太长了我受不了', 'length'],
  ])('maps a natural complaint %s to %s', (text, id) => {
    expect(matchSymptoms(text)[0]?.id).toBe(id)
  })

  it('treats a dropped language pin as evidence', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'zh-style', 'SKILL.md'), skillMd({ name: 'zh-style', description: 'Write documents' }))
    const inventory = buildInventory(detectPlatform({ cwd: s.project }))
    const sessions = [
      session('a', T0, { 'zh-style': 'Always respond in Chinese. Write documents.' }),
      session('b', T0 + DAY, { 'zh-style': 'Write documents.' }),
    ]
    const result = why({ symptom: '不用中文了', inventory, journal: [], store: new Store(), sessions, timeline: catalogTimeline(sessions) })
    expect(result.suspects[0]?.name).toBe('zh-style')
  })
})

describe('--json contract', () => {
  it('carries a schema version and the plugin findings documented in findings.md', () => {
    const json = checkJson({
      platform: { id: 'dsh', label: 'dsh', cwd: '/', projectRoot: '/', roots: [], unscannedRoots: [], host: { name: 'dsh', ok: true }, sessionSources: [] },
      inventory: { active: [], shadowed: [], dropped: [], nested: [], unscanned: [] },
      newEvents: [],
      verdicts: [],
      orphanFindings: [],
      pluginFindings: [{ code: 'plugin-broken', severity: 'critical', subject: 'p', message: 'm', area: 'plugin' }],
      sessions: [],
      timeline: { firstSeen: new Map(), lastSeen: new Map(), latest: new Map(), changes: [] },
    } as never)
    expect(json.schemaVersion).toBe(1)
    expect(json.pluginFindings).toMatchObject([{ code: 'plugin-broken' }])
  })
})
