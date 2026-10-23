import { describe, expect, it } from 'vitest'
import { catalogDescription, parseSkillText } from '../src/frontmatter.js'

describe('parseSkillText (mirrors dsh-skill-filesystem)', () => {
  it('accepts a minimal valid skill', () => {
    const r = parseSkillText('---\nname: pdf-tools\ndescription: Work with PDFs.\n---\n# Body\n')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.skill.name).toBe('pdf-tools')
      expect(r.skill.body).toBe('# Body')
      expect(r.skill.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    }
  })

  it('handles CRLF files', () => {
    const r = parseSkillText('---\r\nname: a\r\ndescription: b\r\n---\r\nbody\r\n')
    expect(r.ok).toBe(true)
  })

  it.each([
    ['My_Skill', 'invalid-name'],
    ['pdf--tools', 'invalid-name'],
    ['PDF', 'invalid-name'],
  ])('drops non-kebab name %s', (name, code) => {
    const r = parseSkillText(`---\nname: ${name}\ndescription: x\n---\n`)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe(code)
      expect(r.rawName).toBe(name)
    }
  })

  it('drops files without frontmatter or required fields', () => {
    expect(parseSkillText('# Just markdown\n')).toMatchObject({ ok: false, code: 'missing-frontmatter' })
    expect(parseSkillText('---\nname: a\n---\n')).toMatchObject({ ok: false, code: 'missing-name-or-description' })
    expect(parseSkillText('---\nname: a\ndescription: ""\n---\n')).toMatchObject({ ok: false, code: 'missing-name-or-description' })
    expect(parseSkillText('---\nname: [a\n---\n')).toMatchObject({ ok: false, code: 'invalid-yaml' })
  })

  it('parses invocation booleans strictly', () => {
    const on = parseSkillText('---\nname: a\ndescription: b\ndisable-model-invocation: "Yes"\nuser-invocable: off\n---\n')
    expect(on.ok && on.skill.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    expect(parseSkillText('---\nname: a\ndescription: b\nuser-invocable: maybe\n---\n')).toMatchObject({ ok: false, code: 'invalid-invocation' })
  })

  it('rejects legacy camelCase invocation keys like dsh does', () => {
    expect(parseSkillText('---\nname: a\ndescription: b\ndisableModelInvocation: true\n---\n')).toMatchObject({ ok: false, code: 'invalid-invocation' })
  })

  it('renders the catalog description like dsh-tool-skill', () => {
    expect(catalogDescription('a  b\n c', 500)).toBe('a b c')
    expect(catalogDescription('x'.repeat(600), 500)).toHaveLength(500)
    expect(catalogDescription('x'.repeat(600), 500).endsWith('...')).toBe(true)
  })
})
