import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localFindings } from '../src/checks.js'
import { buildInventory } from '../src/discover.js'
import { detectPlatform } from '../src/platforms.js'
import { sandbox, skillMd, write } from './helpers.js'

describe('buildInventory on dsh roots', () => {
  it('lets the lower rank win a name collision and reports the loser as shadowed', () => {
    const s = sandbox()
    write(join(s.project, '.dsh', 'skills', 'review', 'SKILL.md'), skillMd({ name: 'review', description: 'project version' }))
    write(join(s.DSH_AGENTS_HOME, 'skills', 'review', 'SKILL.md'), skillMd({ name: 'review', description: 'user version' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.active.map((a) => [a.skill.name, a.root.source])).toEqual([['review', 'project-dsh']])
    expect(inv.shadowed).toHaveLength(1)
    expect(inv.shadowed[0]!.root.source).toBe('user-agents')
    expect(localFindings(inv).find((f) => f.code === 'shadowed')?.severity).toBe('high')
  })

  it('uses the frontmatter name, not the directory name', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'folder-name', 'SKILL.md'), skillMd({ name: 'real-name', description: 'd' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.active.map((a) => a.skill.name)).toEqual(['real-name'])
  })

  it('finds nested skills that dsh will never discover', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'awesome-skills', 'skills', 'pdf', 'SKILL.md'), skillMd({ name: 'pdf', description: 'd' }))
    write(join(s.DSH_HOME, 'skills', 'awesome-skills', 'skills', 'xlsx', 'SKILL.md'), skillMd({ name: 'xlsx', description: 'd' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.active).toHaveLength(0)
    expect(inv.nested[0]!.found).toEqual(['skills/pdf/SKILL.md', 'skills/xlsx/SKILL.md'])
  })

  it('skips .system under the user dsh root and reports dropped skills', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', '.system', 'internal', 'SKILL.md'), skillMd({ name: 'internal', description: 'd' }))
    write(join(s.DSH_HOME, 'skills', 'bad', 'SKILL.md'), skillMd({ name: 'Bad_Name', description: 'd' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.active).toHaveLength(0)
    expect(inv.dropped).toHaveLength(1)
    expect(localFindings(inv).find((f) => f.code === 'dropped')).toMatchObject({ severity: 'critical', subject: 'Bad_Name' })
  })

  it('reports skills in ~/.claude/skills that dsh does not scan', () => {
    const s = sandbox()
    write(join(s.home, '.claude', 'skills', 'cc-only', 'SKILL.md'), skillMd({ name: 'cc-only', description: 'd' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.unscanned).toHaveLength(1)
    expect(inv.unscanned[0]!.entries[0]!.entryName).toBe('cc-only')
  })

  it('flags descriptions longer than the dsh catalog limit', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'long', 'SKILL.md'), skillMd({ name: 'long', description: `${'word '.repeat(110)}中文触发词` }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(localFindings(inv).map((f) => f.code)).toContain('description-truncated')
  })

  it('does not call the same skill installed for Claude Code and for Codex a conflict', () => {
    const s = sandbox('generic')
    const md = skillMd({ name: 'pdf', description: 'PDF tools' })
    write(join(s.home, '.claude', 'skills', 'pdf', 'SKILL.md'), md)
    write(join(s.home, '.codex', 'skills', 'pdf', 'SKILL.md'), skillMd({ name: 'pdf', description: 'a different version' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    expect(inv.shadowed).toEqual([])
    expect(inv.active.map((a) => a.root.agent)).toEqual(['claude-code', 'codex'])
  })

  it('reports a same-name conflict within one agent without claiming which copy wins', () => {
    const s = sandbox('generic')
    write(join(s.project, '.claude', 'skills', 'pdf', 'SKILL.md'), skillMd({ name: 'pdf', description: 'project copy' }))
    write(join(s.home, '.claude', 'skills', 'pdf', 'SKILL.md'), skillMd({ name: 'pdf', description: 'user copy' }))
    const inv = buildInventory(detectPlatform({ cwd: s.project }))
    const f = localFindings(inv).find((x) => x.code === 'shadowed')!
    expect(f.severity).toBe('high')
    expect(f.message).toContain('claude-code 只会加载其中一份')
  })

  it("skips Codex's own .system cache under $CODEX_HOME/skills", () => {
    const s = sandbox('generic')
    write(join(s.home, '.codex', 'skills', '.system', 'builtin', 'SKILL.md'), skillMd({ name: 'builtin', description: 'x' }))
    expect(buildInventory(detectPlatform({ cwd: s.project })).active).toEqual([])
  })

  it('scans ~/.claude/skills in generic mode', () => {
    const s = sandbox('generic')
    write(join(s.home, '.claude', 'skills', 'cc-only', 'SKILL.md'), skillMd({ name: 'cc-only', description: 'd' }))
    const platform = detectPlatform({ cwd: s.project })
    expect(platform.id).toBe('generic')
    expect(buildInventory(platform).active.map((a) => a.skill.name)).toEqual(['cc-only'])
  })
})
