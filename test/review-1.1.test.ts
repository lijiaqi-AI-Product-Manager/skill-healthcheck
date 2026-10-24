// Regressions from the 1.1.0 review: each case used to produce a wrong conclusion.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { localFindings, usageFindings } from '../src/checks.js'
import { buildInventory } from '../src/discover.js'
import { explainWhy } from '../src/why.js'
import { assessImpact } from '../src/impact.js'
import { Store } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { catalogTimeline, type SessionSummary } from '../src/sessions.js'
import { classifyFetchFailure, matchRepoSkills, redactUrl, UpstreamChecker } from '../src/upstream.js'
import { sandbox, skillMd, upstreamRepo, write } from './helpers.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T10:00:00Z')

function session(id: string, t: number, catalog: Record<string, string>, calls: string[] = []): SessionSummary {
  return {
    id,
    createdAt: t,
    catalogs: [{ t, entries: Object.entries(catalog).map(([name, description]) => ({ name, description })) }],
    skillCalls: calls.map((name) => ({ t: t + 1000, name, via: 'model' as const })),
    days: {},
  }
}

describe('fetch failures are classified, not guessed', () => {
  it('never turns an authentication failure on GitHub into "repository deleted"', async () => {
    const result = await classifyFetchFailure('https://github.com/o/private.git', "fatal: could not read Username for 'https://github.com': terminal prompts disabled")
    expect(result.state).toBe('unreachable')
  })

  it('does not read "git-upload-pack: command not found" as a missing repository', async () => {
    const result = await classifyFetchFailure('https://example.com/o/r.git', 'fatal: git-upload-pack: command not found')
    expect(result.state).toBe('unreachable')
  })

  it('still reports a real not-found as missing', async () => {
    const result = await classifyFetchFailure('https://example.com/o/r.git', "remote: Repository not found.")
    expect(result.state).toBe('repo-missing')
  })
})

describe('adopt --repo', () => {
  it('honours --offline and creates no cache', async () => {
    const s = sandbox()
    const store = new Store()
    const checker = new UpstreamChecker(store, { offline: true })
    const result = await checker.fetchRepo('https://example.com/o/r.git')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.result.state).toBe('unreachable')
    expect(existsSync(join(store.dir, 'cache'))).toBe(false)
  })

  it('maps one upstream path to one local skill, not all similar ones', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': skillMd({ name: 'repo-one', description: 'same body' }, '# Same\n') })
    write(join(s.DSH_HOME, 'skills', 'a', 'SKILL.md'), skillMd({ name: 'a', description: 'same body' }, '# Same\n'))
    write(join(s.DSH_HOME, 'skills', 'b', 'SKILL.md'), skillMd({ name: 'b', description: 'same body' }, '# Same\n'))
    const inventory = buildInventory(detectPlatform({ platform: 'dsh', cwd: s.project }))
    const result = await matchRepoSkills(new UpstreamChecker(new Store(), {}), { url: up.bare, subpath: '' }, inventory.active)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.matches).toHaveLength(1)
  })
})

describe('a scan that could not see a root', () => {
  it('is reported instead of looking healthy', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills'), 'this is a file, not a skills directory')
    const inventory = buildInventory(detectPlatform({ platform: 'dsh', cwd: s.project }))
    expect(inventory.errors.length).toBeGreaterThan(0)
    expect(localFindings(inventory).map((f) => f.code)).toContain('scan-error')
  })
})

describe('went-quiet', () => {
  it('only goes critical when the quiet sessions are after the change', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'new text' }))
    const inventory = buildInventory(detectPlatform({ platform: 'dsh', cwd: s.project }))
    const sessions = [
      session('c0', T0, { 'doc-writer': 'old text' }, ['doc-writer']),
      session('c1', T0 + DAY, { 'doc-writer': 'old text' }, ['doc-writer']),
      session('old0', T0 + 2 * DAY, { 'doc-writer': 'old text' }),
      session('old1', T0 + 3 * DAY, { 'doc-writer': 'old text' }),
      session('old2', T0 + 4 * DAY, { 'doc-writer': 'old text' }),
      session('new0', T0 + 5 * DAY, { 'doc-writer': 'new text' }),
      session('new1', T0 + 6 * DAY, { 'doc-writer': 'new text' }),
    ]
    const findings = usageFindings(inventory, sessions, catalogTimeline(sessions))
    expect(findings).toMatchObject([{ code: 'went-quiet', severity: 'high' }])
  })
})

describe('scripts', () => {
  it('reports scripts the upstream removed', () => {
    const findings = assessImpact({
      name: 'x',
      before: { name: 'x', description: 'd', invocation: { modelInvocable: true, userInvocable: true }, body: '' },
      after: { ok: true, skill: { name: 'x', description: 'd', invocation: { modelInvocable: true, userInvocable: true }, body: '' } },
      scripts: { added: [], changed: [], removed: ['run.sh'] },
    })
    expect(findings.map((f) => f.code)).toContain('scripts-removed')
  })

  it('does not call a CRLF script changed when the repo stores CRLF too', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': skillMd({ name: 'crlf', description: 'd' }), 'scripts/run.sh': 'echo one\r\necho two\r\n' })
    execFileSync('git', ['clone', '-q', '-c', 'core.autocrlf=false', up.bare, join(s.DSH_HOME, 'skills', 'crlf')], { cwd: s.root })
    const [v] = (await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, store: new Store() })).verdicts
    expect(v!.findings.map((f) => f.code)).not.toContain('scripts-changed')
    expect(v!.upstream?.state).toBe('current')
  })
})

describe('explain payload', () => {
  it('sends skill text, never the user complaint', async () => {
    const prompts: string[] = []
    const provider = {
      id: 'test',
      model: 'test-model',
      async complete(_system: string, user: string) {
        prompts.push(user)
        return 'ok'
      },
    }
    const result = {
      symptoms: [],
      suspects: [{ name: 'x', score: 1, what: 'changed', evidence: [], change: { from: 'old text', to: 'new text' } }],
    }
    await explainWhy(result, provider, new Store())
    expect(prompts[0]).toContain('<skill_change>')
    expect(prompts[0]).not.toContain('user_complaint')
  })
})

describe('redaction', () => {
  it('masks query values as well as userinfo', () => {
    expect(redactUrl('https://user:tok@host/r.git?access_token=secret&x=1')).toBe('https://***@host/r.git?access_token=***&x=***')
  })
})
