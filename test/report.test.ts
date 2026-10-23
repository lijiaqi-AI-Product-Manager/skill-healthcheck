import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { Store } from '../src/journal.js'
import { renderCheck } from '../src/report.js'
import { sandbox, skillMd, write } from './helpers.js'

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')

describe('renderCheck', () => {
  it('counts a folder of nested skills as one problem and says how many are inside', async () => {
    const s = sandbox()
    for (let i = 0; i < 15; i++) write(join(s.DSH_HOME, 'skills', 'superpowers', 'skills', `s${i}`, 'SKILL.md'), skillMd({ name: `s${i}`, description: 'd' }))
    write(join(s.DSH_HOME, 'skills', 'ok', 'SKILL.md'), skillMd({ name: 'ok', description: 'fine' }))
    const out = strip(renderCheck(await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, offline: true, store: new Store() })))
    // "ok" has no known source, so it's healthy locally but unchecked upstream.
    expect(out).toMatch(/技能 {2}2：0 正常 · 0 有更新 · 1 失效 · 1 未检查/)
    expect(out).toContain('15 个技能嵌套太深')
    expect(out).toContain('技能 1 个需你逐个确认')
  })

  it('stays within the 15-line budget and folds the rest', async () => {
    const s = sandbox()
    for (let i = 0; i < 30; i++) write(join(s.DSH_HOME, 'skills', `bad${i}`, 'SKILL.md'), skillMd({ name: `Bad_${i}`, description: 'd' }))
    const out = strip(renderCheck(await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, offline: true, store: new Store() })))
    expect(out.split('\n').length).toBeLessThanOrEqual(15)
    expect(out).toMatch(/…另 \d+ 项/)
  })

  it('ends with an all-clear line when nothing needs attention', async () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'ok', 'SKILL.md'), skillMd({ name: 'ok', description: 'fine' }))
    const out = strip(renderCheck(await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, offline: true, store: new Store() })))
    expect(out.split('\n').at(-1)).toContain('都还在正常工作')
  })
})

// End-to-end through the built binary; CI builds before testing.
const cli = join(__dirname, '..', 'dist', 'cli.js')
describe.runIf(existsSync(cli))('cli', () => {
  const run = (args: string[], env: NodeJS.ProcessEnv) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { env: { ...process.env, ...env, NO_COLOR: '1' }, encoding: 'utf8' }) }
    } catch (e: any) {
      return { code: e.status as number, out: String(e.stdout ?? '') + String(e.stderr ?? '') }
    }
  }

  it('exits 1 when something is broken and 0 when healthy', () => {
    const s = sandbox()
    const env = { ...s }
    write(join(s.DSH_HOME, 'skills', 'ok', 'SKILL.md'), skillMd({ name: 'ok', description: 'fine' }))
    expect(run(['--offline', '--cwd', s.project], env).code).toBe(0)
    write(join(s.DSH_HOME, 'skills', 'bad', 'SKILL.md'), skillMd({ name: 'Bad', description: 'x' }))
    expect(run(['--offline', '--cwd', s.project], env).code).toBe(1)
  })

  it('prints valid JSON and rejects unknown commands with exit 2', () => {
    const s = sandbox()
    const json = run(['--json', '--offline', '--cwd', s.project], { ...s })
    expect(() => JSON.parse(json.out)).not.toThrow()
    expect(run(['frobnicate'], { ...s }).code).toBe(2)
    expect(run(['adopt', 'x', '--upload-pack=evil'], { ...s }).code).toBe(2)
  })
})
