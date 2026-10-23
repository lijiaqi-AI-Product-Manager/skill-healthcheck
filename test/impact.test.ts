import { describe, expect, it } from 'vitest'
import { parseSkillText, type ParsedSkill } from '../src/frontmatter.js'
import { assessImpact, wordDiff } from '../src/impact.js'
import { skillMd } from './helpers.js'

const parsed = (fm: Record<string, unknown>, body?: string): ParsedSkill => {
  const r = parseSkillText(skillMd(fm, body))
  if (!r.ok) throw new Error(r.reason)
  return r.skill
}
const codes = (fs: { code: string }[]) => fs.map((f) => f.code)
const before = parsed({ name: 'zh-writer', description: '中文写作助手：在用户要求写中文文章时使用' }, 'Write well.')

describe('assessImpact', () => {
  it('flags a description change as critical and names the removed words', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: 'Writing assistant. Write in a professional tone.' }, 'Write well.'))
    const out = assessImpact({ name: 'zh-writer', before, after, os: 'linux' })
    const f = out.find((x) => x.code === 'description-changed')!
    expect(f.severity).toBe('critical')
    expect(f.message).toContain('"中文"')
    expect(f.detail?.join('\n')).toContain('professional tone')
  })

  it('treats a description that only gained words as a medium change', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: `${before.description}，也可用于润色中文邮件` }, 'Write well.'))
    const f = assessImpact({ name: 'zh-writer', before, after, os: 'linux' })[0]!
    expect(f).toMatchObject({ code: 'description-changed', severity: 'medium' })
    expect(f.message).toContain('扩写')
  })

  it('does not count a reworded verb form as a removed trigger', () => {
    const b = parsed({ name: 'x', description: 'Discovers skills for the current task' })
    const after = parseSkillText(skillMd({ name: 'x', description: 'Discover skills for the current task' }))
    expect(assessImpact({ name: 'x', before: b, after, os: 'linux' })[0]?.severity).toBe('medium')
  })

  it('reports a rename as a broken /entry point', () => {
    const after = parseSkillText(skillMd({ name: 'writer', description: before.description }, 'Write well.'))
    const out = assessImpact({ name: 'zh-writer', before, after, os: 'linux' })
    expect(out).toMatchObject([{ code: 'name-changed', severity: 'critical' }])
    expect(out[0]!.message).toContain('/zh-writer')
  })

  it('reports an upstream version that would be dropped', () => {
    const after = parseSkillText(skillMd({ name: 'Zh_Writer', description: 'x' }))
    expect(assessImpact({ name: 'zh-writer', before, after })).toMatchObject([{ code: 'upstream-invalid', severity: 'critical' }])
  })

  it('asks for a human review of new scripts and notes foreign shells', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: before.description }, 'Write well.'))
    const out = assessImpact({ name: 'zh-writer', before, after, scripts: { added: ['install.sh'], changed: [], removed: [] }, os: 'windows' })
    expect(out[0]).toMatchObject({ code: 'scripts-added', severity: 'high' })
    expect(out[0]!.detail?.join()).toContain('install.sh')
  })

  it('warns when a description crosses the catalog limit', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: `${before.description} ${'more text '.repeat(60)}` }, 'Write well.'))
    expect(codes(assessImpact({ name: 'zh-writer', before, after, catalogMaxLength: 500 }))).toContain('description-truncated')
  })

  it('counts body growth in tokens, not as catalog crowding', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: before.description }, `Write well.\n${'细节说明。'.repeat(600)}`))
    const out = assessImpact({ name: 'zh-writer', before, after })
    expect(out).toMatchObject([{ code: 'body-grew', severity: 'low' }])
    expect(out[0]!.message).toMatch(/token/)
  })

  it('flags platform-specific syntax that does not run on this OS', () => {
    const after = parseSkillText(skillMd({ name: 'zh-writer', description: before.description }, 'Write well.\nRun `Get-ChildItem -Recurse` first.'))
    expect(codes(assessImpact({ name: 'zh-writer', before, after, os: 'macos' }))).toEqual(['platform-specific'])
    expect(assessImpact({ name: 'zh-writer', before, after, os: 'windows' })).toEqual([])
  })

  it('reports nothing for an identical skill', () => {
    expect(assessImpact({ name: 'zh-writer', before, after: { ok: true, skill: before } })).toEqual([])
  })
})

describe('wordDiff', () => {
  it('segments Chinese into words', () => {
    const d = wordDiff('中文写作助手', '英文写作助手')
    expect(d.removed).toContain('中文')
    expect(d.added).toContain('英文')
  })
})
