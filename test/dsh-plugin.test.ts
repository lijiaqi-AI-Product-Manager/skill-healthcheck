import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS module without type declarations
import { createPlugin } from '../packages/dsh-skill-healthcheck/lib/plugin.js'
import * as core from '../src/index.js'
import { Store } from '../src/journal.js'
import { sandbox, skillMd, write } from './helpers.js'

/** The slice of the cordis context the plugin touches, as dsh 0.2.x provides it. */
function fakeContext(withCommands = true) {
  const listeners = new Map<string, Array<() => void>>()
  const commands: any[] = []
  const disposers: Array<() => void> = []
  const ctx: any = {
    logger: { warn: vi.fn() },
    on(name: string, fn: () => void) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn])
    },
    effect(gen: () => Generator<() => void>) {
      for (const d of gen()) disposers.push(d)
    },
    inject(deps: string[], cb: (c: any) => void) {
      if (deps.every((d) => d !== 'commands' || withCommands)) cb(ctx)
    },
    commands: {
      register(def: any) {
        commands.push(def)
        return () => {}
      },
    },
    get: () => undefined,
  }
  const emit = (name: string) => listeners.get(name)?.forEach((fn) => fn())
  return { ctx, commands, disposers, emit }
}

describe('dsh plugin', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('records on boot and again when dsh reports a catalog change', () => {
    const s = sandbox()
    vi.spyOn(process, 'cwd').mockReturnValue(s.project)
    write(join(s.DSH_HOME, 'skills', 'a', 'SKILL.md'), skillMd({ name: 'a', description: 'A' }))
    const { ctx, emit } = fakeContext()
    createPlugin(core).apply(ctx, { lang: 'zh' })
    expect(new Store().readJournal()).toEqual([]) // boot snapshot is deferred off the startup path
    vi.advanceTimersByTime(1)
    expect(new Store().readJournal().map((e) => [e.kind, e.name])).toEqual([['baseline', 'a']])

    write(join(s.DSH_HOME, 'skills', 'b', 'SKILL.md'), skillMd({ name: 'b', description: 'B' }))
    emit('skills/change')
    emit('skills/change') // debounced: one record for a burst
    vi.advanceTimersByTime(2000)
    expect(new Store().readJournal().map((e) => [e.kind, e.name])).toEqual([
      ['baseline', 'a'],
      ['added', 'b'],
    ])
  })

  it('registers /skill-healthcheck and answers check, why, log, ls', async () => {
    vi.useRealTimers()
    const s = sandbox()
    vi.spyOn(process, 'cwd').mockReturnValue(s.project)
    write(join(s.DSH_HOME, 'skills', 'bad', 'SKILL.md'), skillMd({ name: 'Bad', description: 'x' }))
    const { ctx, commands } = fakeContext()
    createPlugin(core).apply(ctx, { offline: true, lang: 'en' })
    expect(commands).toHaveLength(1)
    const cmd = commands[0]
    expect(cmd).toMatchObject({ name: 'skill-healthcheck', definitionId: 'dsh-skill-healthcheck' })
    expect(cmd.description).toMatch(/Skill checkup/)

    const run = (rawInput: string) => cmd.handler({ rawInput, agent: undefined, signal: new AbortController().signal })
    const check = await run('')
    expect(check.kind).toBe('success')
    expect(check.text).toContain('silently drops it')
    expect(check.text).not.toMatch(/\x1b\[/) // no terminal colors in chat
    expect((await run('why stopped replying in Chinese')).kind).toBe('success')
    expect((await run('log')).kind).toBe('success')
    expect((await run('ls')).text).toContain('Bad')
    expect(await run('why')).toMatchObject({ kind: 'error' })
    expect(await run('frobnicate')).toMatchObject({ kind: 'error' })
  })

  it('still records in profiles without a command registry', () => {
    const s = sandbox()
    vi.spyOn(process, 'cwd').mockReturnValue(s.project)
    write(join(s.DSH_HOME, 'skills', 'a', 'SKILL.md'), skillMd({ name: 'a', description: 'A' }))
    const { ctx, commands } = fakeContext(false)
    createPlugin(core).apply(ctx)
    vi.advanceTimersByTime(1)
    expect(commands).toHaveLength(0)
    expect(new Store().readJournal()).toHaveLength(1)
  })

  it('cancels pending work when the plugin is disposed', () => {
    const s = sandbox()
    vi.spyOn(process, 'cwd').mockReturnValue(s.project)
    write(join(s.DSH_HOME, 'skills', 'a', 'SKILL.md'), skillMd({ name: 'a', description: 'A' }))
    const { ctx, disposers } = fakeContext()
    createPlugin(core).apply(ctx)
    for (const d of disposers) d()
    vi.advanceTimersByTime(5000)
    expect(new Store().readJournal()).toEqual([])
  })
})
