import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { localFindings } from '../src/checks.js'
import { buildInventory } from '../src/discover.js'
import { parseSkillText } from '../src/frontmatter.js'
import { detectPlatform } from '../src/platforms.js'
import { sandbox, skillMd, write } from './helpers.js'

function generic(setup: (s: ReturnType<typeof sandbox>) => void, cwd?: (s: ReturnType<typeof sandbox>) => string) {
  const s = sandbox('generic')
  setup(s)
  const inv = buildInventory(detectPlatform({ cwd: cwd ? cwd(s) : s.project }))
  return { s, inv, findings: localFindings(inv) }
}

describe('Claude Code dialect', () => {
  const cc = (s: ReturnType<typeof sandbox>, folder: string, text: string) => write(join(s.home, '.claude', 'skills', folder, 'SKILL.md'), text)

  it('loads names that are not kebab-case; only dsh requires that', () => {
    const { inv, findings } = generic((s) => cc(s, 'my-skill', skillMd({ name: 'Bad_Name', description: 'd' })))
    expect(inv.active.map((a) => a.skill.name)).toEqual(['Bad_Name'])
    expect(findings.filter((f) => f.code === 'dropped')).toEqual([])
  })

  it('falls back to the folder name and the first body line, and says so', () => {
    const { inv, findings } = generic((s) => cc(s, 'notes', '\n# Meeting notes\n\nSummarize meetings.\n'))
    expect(inv.active[0]!.skill.name).toBe('notes')
    expect(inv.active[0]!.skill.description).toBe('# Meeting notes')
    const f = findings.find((x) => x.code === 'no-description')!
    expect(f.severity).toBe('medium')
  })

  it('loads a skill whose YAML is broken, but reports that its description is ignored', () => {
    const { inv, findings } = generic((s) => cc(s, 'broken', '---\nname: broken\ndescription: [unclosed\n---\nBody line\n'))
    expect(inv.active.map((a) => a.skill.name)).toEqual(['broken'])
    const f = findings.find((x) => x.code === 'frontmatter-ignored')!
    expect(f.severity).toBe('critical')
    expect(findings.some((x) => x.code === 'no-description')).toBe(false)
  })

  it('drops a name with characters Claude Code refuses', () => {
    const { inv, findings } = generic((s) => cc(s, 'x', skillMd({ name: 'a<b', description: 'd' })))
    expect(inv.active).toEqual([])
    expect(findings.find((x) => x.code === 'dropped')!.message).toContain('Claude Code')
  })

  it('scans ~/.claude/skills/synced as its own root and ignores .trash', () => {
    const { inv, findings } = generic((s) => {
      cc(s, join('synced', 'from-web'), skillMd({ name: 'from-web', description: 'd' }))
      cc(s, join('.trash', '2026-10-01', 'old'), skillMd({ name: 'old', description: 'd' }))
    })
    expect(inv.active.map((a) => [a.skill.name, a.root.source])).toEqual([['from-web', 'claude-synced']])
    expect(findings.filter((f) => f.code === 'nested')).toEqual([])
  })

  it('reports a project skill in a folder called synced, which Claude Code skips', () => {
    const { inv, findings } = generic((s) => write(join(s.project, '.claude', 'skills', 'Synced', 'SKILL.md'), skillMd({ name: 'synced-skill', description: 'd' })))
    expect(inv.active).toEqual([])
    expect(findings.find((x) => x.code === 'dropped')!.message).toContain('Synced')
  })

  it('ignores loose .md files, which Claude Code never reads as skills', () => {
    const { inv, findings } = generic((s) => write(join(s.home, '.claude', 'skills', 'README.md'), '# My skills\n'))
    expect(inv.dropped).toEqual([])
    expect(findings).toEqual([])
  })

  it('uses the 1,536-character listing cap on description plus when_to_use', () => {
    const { findings } = generic((s) => {
      cc(s, 'long', skillMd({ name: 'long', description: 'x'.repeat(1000), when_to_use: 'y'.repeat(600) }))
      cc(s, 'medium', skillMd({ name: 'medium', description: 'z'.repeat(700) }))
    })
    expect(findings.filter((f) => f.code === 'description-truncated').map((f) => f.subject)).toEqual(['long'])
  })

  it('reads .claude/skills in every directory from the start directory up to the repo root', () => {
    const { inv } = generic(
      (s) => write(join(s.project, '.claude', 'skills', 'root-skill', 'SKILL.md'), skillMd({ name: 'root-skill', description: 'd' })),
      (s) => {
        const sub = join(s.project, 'packages', 'web')
        write(join(sub, '.claude', 'skills', 'web-skill', 'SKILL.md'), skillMd({ name: 'web-skill', description: 'd' }))
        return sub
      },
    )
    expect(inv.active.map((a) => a.skill.name).sort()).toEqual(['root-skill', 'web-skill'])
  })
})

describe('Codex dialect', () => {
  const cx = (s: ReturnType<typeof sandbox>, rel: string, text: string) => write(join(s.home, '.agents', 'skills', rel, 'SKILL.md'), text)

  it('discovers skills nested a few folders down, as Codex walks the tree', () => {
    const { inv, findings } = generic((s) => cx(s, join('vendor', 'pack', 'deep-skill'), skillMd({ name: 'deep-skill', description: 'd' })))
    expect(inv.active.map((a) => a.skill.name)).toEqual(['deep-skill'])
    expect(findings).toEqual([])
  })

  it('reports skills deeper than Codex looks', () => {
    const { inv, findings } = generic((s) => cx(s, join('a', 'b', 'c', 'd', 'e', 'f'), skillMd({ name: 'too-deep', description: 'd' })))
    expect(inv.active).toEqual([])
    const f = findings.find((x) => x.code === 'nested')!
    expect(f.subject).toBe('a')
    expect(f.message).toContain('6')
  })

  it('skips hidden folders', () => {
    const { inv } = generic((s) => cx(s, join('.cache', 'x'), skillMd({ name: 'x', description: 'd' })))
    expect(inv.active).toEqual([])
  })

  it('requires a description but not a name', () => {
    const { inv, findings } = generic((s) => {
      cx(s, 'unnamed', '---\ndescription: does things\n---\nbody\n')
      cx(s, 'silent', '---\nname: silent\n---\nbody\n')
    })
    expect(inv.active.map((a) => a.skill.name)).toEqual(['unnamed'])
    expect(findings.find((x) => x.code === 'dropped')!.subject).toBe('silent')
  })
})

describe('parseSkillText dialects', () => {
  it('repairs Codex prose with a colon, like codex-rs does', () => {
    const text = '---\nname: aws\ndescription: Build for AWS: ECS and Lambda # deploy\n---\nbody\n'
    expect(parseSkillText(text).ok).toBe(false)
    const codex = parseSkillText(text, { dialect: 'codex', dirName: 'aws' })
    expect(codex.ok && codex.skill.description).toBe('Build for AWS: ECS and Lambda')
  })

  it('caps Codex names at 64 characters', () => {
    const r = parseSkillText(skillMd({ name: 'n'.repeat(65), description: 'd' }), { dialect: 'codex', dirName: 'n' })
    expect(r.ok).toBe(false)
  })

  it('reads lenient booleans in Claude Code and ignores dsh legacy keys', () => {
    const r = parseSkillText('---\nname: x\ndescription: d\ndisable-model-invocation: Yes\ndisableModelInvocation: true\n---\n', { dialect: 'claude-code', dirName: 'x' })
    expect(r.ok && r.skill.invocation.modelInvocable).toBe(false)
  })
})
