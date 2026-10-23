import { describe, expect, it } from 'vitest'
import { loadLexicon } from '../src/lexicon.js'
import { matchSymptoms } from '../src/why.js'

describe('lexicon', () => {
  const lex = loadLexicon()

  it('compiles every regex and every platform example matches its own token', () => {
    for (const s of lex.symptoms) for (const r of s.skill_signals.regex) expect(() => new RegExp(r, 'i')).not.toThrow()
    for (const t of lex.platform_tokens) expect(new RegExp(t.regex, 'i').test(t.example), t.id).toBe(true)
  })

  it.each([
    ['为什么它现在不用中文回答我了', 'language'],
    ['最近全是英文', 'language'],
    ['why is it answering in English now', 'language'],
    ['它现在说话太官方了', 'tone'],
    ['为什么它最近总是一直问我问题', 'asks-too-many-questions'],
    ['怎么突然自己 git commit 了', 'git-behavior'],
    ['pdf 那个技能好像不再触发了', 'skill-not-triggered'],
  ])('maps "%s" to %s', (complaint, id) => {
    expect(matchSymptoms(complaint)[0]?.id).toBe(id)
  })

  it('matches nothing for unrelated text', () => {
    expect(matchSymptoms('今天天气不错')).toEqual([])
  })
})
