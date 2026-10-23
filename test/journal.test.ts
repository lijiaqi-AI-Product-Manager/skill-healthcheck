import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildInventory } from '../src/discover.js'
import { diffSnapshots, record, Store, type SkillState, type Snapshot } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { sandbox, skillMd, write } from './helpers.js'

const state = (over: Partial<SkillState>): SkillState => ({
  key: '/a/SKILL.md',
  name: 'a',
  status: 'active',
  source: 'user-dsh',
  rank: 400,
  sha: 'x',
  description: 'd',
  bodyChars: 10,
  scripts: {},
  fileTime: 1000,
  mtime: 1000,
  ...over,
})
const snap = (t: number, ...skills: SkillState[]): Snapshot => ({ v: 1, t, platform: 'dsh', skills: Object.fromEntries(skills.map((s) => [s.key, s])) })

describe('diffSnapshots', () => {
  it('records a baseline with estimated times on the first run', () => {
    const events = diffSnapshots(undefined, snap(5000, state({})))
    expect(events).toMatchObject([{ kind: 'baseline', estimated: true, t: 1000, name: 'a' }])
  })

  it('detects add / change / remove and clamps times into the observation window', () => {
    const prev = snap(2000, state({}), state({ key: '/gone/SKILL.md', name: 'gone', sha: 'g' }))
    const cur = snap(9000, state({ sha: 'y', description: 'new', mtime: 7000 }), state({ key: '/new/SKILL.md', name: 'new', sha: 'n', fileTime: 100, mtime: 100 }))
    const events = diffSnapshots(prev, cur)
    const byKind = Object.fromEntries(events.map((e) => [e.kind, e]))
    expect(byKind.changed).toMatchObject({ t: 7000, diff: { descriptionChanged: true } })
    expect(byKind.added).toMatchObject({ name: 'new', t: 2000 })
    expect(byKind.removed).toMatchObject({ name: 'gone', t: 9000 })
  })

  it('treats a path change with the same content as a move', () => {
    const prev = snap(2000, state({}))
    const cur = snap(3000, state({ key: '/b/SKILL.md', mtime: 2500 }))
    expect(diffSnapshots(prev, cur).map((e) => e.kind)).toEqual(['moved'])
  })

  it('notices new scripts even when SKILL.md is unchanged', () => {
    const prev = snap(2000, state({}))
    const cur = snap(3000, state({ scripts: { 'run.sh': 'abc' } }))
    expect(diffSnapshots(prev, cur)[0]).toMatchObject({ kind: 'changed', diff: { scriptsAdded: ['run.sh'] } })
  })
})

describe('record', () => {
  it('appends only what changed and keeps old versions in the blob store', () => {
    const s = sandbox()
    const file = join(s.DSH_HOME, 'skills', 'zh', 'SKILL.md')
    write(file, skillMd({ name: 'zh', description: '中文写作助手' }))
    const store = new Store()
    const platform = detectPlatform({ cwd: s.project })
    expect(record(buildInventory(platform), store).map((e) => e.kind)).toEqual(['baseline'])
    expect(record(buildInventory(platform), store)).toEqual([])
    write(file, skillMd({ name: 'zh', description: 'Writing assistant, professional tone' }))
    const events = record(buildInventory(platform), store)
    expect(events.map((e) => e.kind)).toEqual(['changed'])
    expect(store.getBlob(events[0]!.before!.sha)).toContain('中文写作助手')
    expect(store.readJournal()).toHaveLength(2)
  })
})
