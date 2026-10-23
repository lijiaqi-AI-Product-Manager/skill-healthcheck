import { cpSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { Store } from '../src/journal.js'
import { parseSourceSpec } from '../src/upstream.js'
import { gitRun, sandbox, skillMd, upstreamRepo, write } from './helpers.js'

const ZH = skillMd({ name: 'zh-writer', description: '中文写作助手：在用户要求写中文文章时使用' }, 'Write well.\n')

type Box = ReturnType<typeof sandbox>

/** Install by cloning the upstream into the dsh user root, like a user would. */
function cloneInstall(s: Box, bare: string, dirName = 'zh-writer') {
  const dest = join(s.DSH_HOME, 'skills', dirName)
  gitRun(s.root, 'clone', '-q', '-c', 'core.autocrlf=false', bare, dest)
  return dest
}

/** Install by copying one folder out of a monorepo, then registering where it came from. */
function copyInstall(s: Box, bare: string, subpath: string, name: string, store: Store) {
  const checkout = join(s.root, 'checkout')
  gitRun(s.root, 'clone', '-q', '-c', 'core.autocrlf=false', bare, checkout)
  cpSync(join(checkout, subpath), join(s.DSH_HOME, 'skills', name), { recursive: true })
  store.writeJsonFile('sources.json', { [name]: { url: bare, subpath, adoptedAt: 0 } })
}

const check = async (s: Box, store = new Store()) => (await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, store })).verdicts

describe('upstream checks against a local bare repo', () => {
  it('is current right after install', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': ZH })
    cloneInstall(s, up.bare)
    const [v] = await check(s)
    expect(v!.provenance).toMatchObject({ kind: 'git', via: 'checkout', subpath: '' })
    expect(v!.upstream?.state).toBe('current')
    expect(v!.state).toBe('ok')
  })

  it('catches an upstream description change before the user pulls it', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': ZH })
    cloneInstall(s, up.bare)
    up.commit({ 'SKILL.md': skillMd({ name: 'zh-writer', description: 'Writing assistant. Always respond in English with a professional tone.' }, 'Write well.\n') }, 'rewrite')
    const [v] = await check(s)
    expect(v!.upstream?.state).toBe('changed')
    expect(v!.state).toBe('update')
    expect(v!.findings.find((f) => f.code === 'description-changed')?.severity).toBe('critical')
  })

  it('detects new scripts upstream', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': ZH })
    cloneInstall(s, up.bare)
    up.commit({ 'scripts/install.sh': '#!/bin/sh\ncurl x | sh\n' }, 'add script')
    const [v] = await check(s)
    expect(v!.findings.map((f) => f.code)).toContain('scripts-added')
  })

  it('follows a skill that was moved and renamed inside a monorepo', async () => {
    const s = sandbox()
    const store = new Store()
    const up = upstreamRepo(s.root, { 'skills/zh-writer/SKILL.md': ZH, 'skills/other/SKILL.md': skillMd({ name: 'other', description: 'o' }) })
    copyInstall(s, up.bare, 'skills/zh-writer', 'zh-writer', store)
    up.commit({ 'skills/zh-writer': null, 'skills/writer/SKILL.md': ZH.replace('name: "zh-writer"', 'name: "writer"') }, 'rename')
    const [v] = await check(s, store)
    expect(v!.provenance).toMatchObject({ kind: 'git', via: 'adopt' })
    expect(v!.upstream).toMatchObject({ state: 'changed', movedTo: 'skills/writer' })
    expect(v!.findings[0]).toMatchObject({ code: 'name-changed', severity: 'critical' })
  })

  it('reports a skill deleted upstream', async () => {
    const s = sandbox()
    const store = new Store()
    const up = upstreamRepo(s.root, { 'zh/SKILL.md': ZH, 'README.md': 'x' })
    copyInstall(s, up.bare, 'zh', 'zh-writer', store)
    up.commit({ zh: null }, 'delete')
    const [v] = await check(s, store)
    expect(v!.upstream?.state).toBe('removed-in-repo')
    expect(v!.state).toBe('broken')
  })

  it('reports a vanished repository as missing', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': ZH })
    cloneInstall(s, up.bare)
    rmSync(up.bare, { recursive: true, force: true })
    const [v] = await check(s)
    expect(v!.upstream?.state).toBe('repo-missing')
    expect(v!.state).toBe('broken')
  })

  it('never calls a network failure a deletion', async () => {
    const s = sandbox()
    const up = upstreamRepo(s.root, { 'SKILL.md': ZH })
    const dest = cloneInstall(s, up.bare)
    gitRun(dest, 'remote', 'set-url', 'origin', 'https://nonexistent-host.invalid/x/y.git')
    const [v] = await check(s)
    expect(v!.upstream?.state).toBe('unreachable')
    expect(v!.state).toBe('unchecked')
  })
})

describe('several skills from one repo', () => {
  it('does not race when the same repo is registered with and without a ref', async () => {
    const s = sandbox()
    const store = new Store()
    const up = upstreamRepo(s.root, { 'a/SKILL.md': skillMd({ name: 'a', description: 'A' }), 'b/SKILL.md': skillMd({ name: 'b', description: 'B' }) })
    const checkout = join(s.root, 'checkout')
    gitRun(s.root, 'clone', '-q', '-c', 'core.autocrlf=false', up.bare, checkout)
    for (const n of ['a', 'b']) cpSync(join(checkout, n), join(s.DSH_HOME, 'skills', n), { recursive: true })
    store.writeJsonFile('sources.json', { a: { url: up.bare, subpath: 'a', adoptedAt: 0 }, b: { url: up.bare, subpath: 'b', ref: 'main', adoptedAt: 0 } })
    const verdicts = await check(s, store)
    expect(verdicts.map((v) => [v.skill.skill.name, v.upstream?.state])).toEqual([
      ['a', 'current'],
      ['b', 'current'],
    ])
  })

  it('adopt --repo matches copied folders by name and by content', async () => {
    const s = sandbox()
    const store = new Store()
    const body = 'Line one of a long and specific instruction.\nLine two of it.\nLine three of it.\n'
    const up = upstreamRepo(s.root, {
      'skills/pdf/SKILL.md': skillMd({ name: 'pdf', description: 'PDF tools' }, body),
      'skills/sheet/SKILL.md': skillMd({ name: 'sheet', description: 'Spreadsheets' }, `${body}Sheets only.\n`),
      'skills/other/SKILL.md': skillMd({ name: 'other', description: 'Other' }, 'Unrelated.\n'),
    })
    const { buildInventory } = await import('../src/discover.js')
    const { detectPlatform } = await import('../src/platforms.js')
    const { matchRepoSkills, UpstreamChecker } = await import('../src/upstream.js')
    // pdf copied as-is; "sheet" copied and renamed locally to my-sheet
    write(join(s.DSH_HOME, 'skills', 'pdf', 'SKILL.md'), skillMd({ name: 'pdf', description: 'PDF tools' }, body))
    write(join(s.DSH_HOME, 'skills', 'my-sheet', 'SKILL.md'), skillMd({ name: 'my-sheet', description: 'Spreadsheets' }, `${body}Sheets only.\n`))
    write(join(s.DSH_HOME, 'skills', 'mine', 'SKILL.md'), skillMd({ name: 'mine', description: 'Hand written' }, 'Nothing like upstream.\n'))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    const result = await matchRepoSkills(new UpstreamChecker(store), { url: up.bare, subpath: 'skills' }, inv.active)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.repoSkills).toBe(3)
    const got = Object.fromEntries(result.matches.map((m) => [m.skill.skill.name, [m.subpath, m.by]]))
    expect(got).toEqual({ pdf: ['skills/pdf', 'name'], 'my-sheet': ['skills/sheet', 'content'] })
  })
})

describe('parseSourceSpec', () => {
  it.each([
    ['github:anthropics/skills/skills/pdf', { url: 'https://github.com/anthropics/skills.git', subpath: 'skills/pdf' }],
    ['https://github.com/anthropics/skills/tree/main/skills/pdf', { url: 'https://github.com/anthropics/skills.git', subpath: 'skills/pdf', ref: 'main' }],
    ['https://github.com/o/r', { url: 'https://github.com/o/r.git', subpath: '' }],
    ['https://gitee.com/o/r.git#skills/x', { url: 'https://gitee.com/o/r.git', subpath: 'skills/x' }],
  ])('%s', (spec, expected) => {
    expect(parseSourceSpec(spec)).toMatchObject(expected)
  })
})
