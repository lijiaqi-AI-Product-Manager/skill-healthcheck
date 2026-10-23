// The CLI's exit code is the only thing CI can see. These run the built binary end to end,
// because "the check found something" and "the process said so" are two different promises.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gitRun, sandbox, skillMd, upstreamRepo, write } from './helpers.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T10:00:00Z')
const CLI = join(process.cwd(), 'dist', 'cli.js')

function run(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { env: { ...process.env }, encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (error) {
    const e = error as { status?: number; stdout?: string }
    return { code: e.status ?? -1, stdout: e.stdout ?? '' }
  }
}

function dshSession(id: string, t: number, description: string, calls: string[]): string {
  const records = [
    { type: 'session', version: 4, id, createdAt: t, cwd: '/w' },
    {
      type: 'user/message',
      time: t + 1,
      data: {
        content: [{ type: 'text', text: '<system-reminder>…' }],
        source: { kind: 'skill-catalog', form: 'catalog', entries: [{ name: 'doc-writer', description }] },
      },
    },
    ...calls.map((name, i) => ({ type: 'tool/call', time: t + 2 + i, data: { name: 'skill', arguments: JSON.stringify({ name }) } })),
    { type: 'assistant/message', time: t + 5, data: { message: { role: 'assistant', content: [{ type: 'text', text: '好的，我来整理。' }] } } },
  ]
  return records.map((r) => JSON.stringify(r)).join('\n')
}

describe('cli exit codes', () => {
  it('exits 1 for a skill the model stopped calling (usage critical)', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'new text' }))
    const dir = join(s.DSH_HOME, 'sessions', 'ws')
    const sessions = [
      ...Array.from({ length: 3 }, (_, d) => ({ id: `c${d}`, t: T0 + d * DAY, description: 'old text', calls: ['doc-writer'] })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, t: T0 + (3 + i) * DAY, description: 'new text', calls: [] as string[] })),
    ]
    for (const session of sessions) write(join(dir, session.id, 'session.v4.jsonl'), dshSession(session.id, session.t, session.description, session.calls))
    const { code, stdout } = run(['check', '--json', '--cwd', s.project])
    const json = JSON.parse(stdout)
    expect(json.skills[0].state).toBe('broken')
    expect(json.skills[0].findings.map((f: { code: string; severity: string }) => `${f.code}:${f.severity}`)).toContain('went-quiet:critical')
    expect(code).toBe(1)
  })

  it('exits 0 when only an upstream description changed', () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': skillMd({ name: 'doc-writer', description: 'Write documents.' }) })
    gitRun(s.root, 'clone', '-q', '-c', 'core.autocrlf=false', up.bare, join(s.DSH_HOME, 'skills', 'doc-writer'))
    up.commit({ 'SKILL.md': skillMd({ name: 'doc-writer', description: 'Write documents, memos and reports for the team.' }) }, 'expand')
    const { code, stdout } = run(['check', '--json', '--no-sessions', '--cwd', s.project])
    const json = JSON.parse(stdout)
    expect(json.skills[0].state).toBe('update')
    expect(json.skills[0].findings.map((f: { code: string }) => f.code)).toContain('description-changed')
    expect(code).toBe(0)
  })
})
