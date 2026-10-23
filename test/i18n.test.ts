import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { buildInventory } from '../src/discover.js'
import { parseSkillText } from '../src/frontmatter.js'
import { detectLang, setLang, t } from '../src/i18n.js'
import { assessImpact } from '../src/impact.js'
import { record, Store } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { renderCheck, renderDetails, renderInventory, renderJournal, renderWhy } from '../src/report.js'
import { why } from '../src/why.js'
import { sandbox, skillMd, write } from './helpers.js'

const CJK = /[一-鿿]/

/** A sandbox that trips nearly every local check, all with ASCII data. */
function messySandbox() {
  const s = sandbox()
  write(join(s.DSH_HOME, 'skills', 'ok', 'SKILL.md'), skillMd({ name: 'ok', description: 'fine' }))
  write(join(s.DSH_HOME, 'skills', 'bad', 'SKILL.md'), skillMd({ name: 'Bad_Name', description: 'x' }))
  write(join(s.DSH_HOME, 'skills', 'legacy', 'SKILL.md'), skillMd({ name: 'legacy', description: 'x', disableModelInvocation: true }))
  write(join(s.DSH_HOME, 'skills', 'manual', 'SKILL.md'), skillMd({ name: 'manual', description: 'x', 'disable-model-invocation': true }))
  write(join(s.DSH_HOME, 'skills', 'long', 'SKILL.md'), skillMd({ name: 'long', description: 'word '.repeat(120) }))
  write(join(s.DSH_HOME, 'skills', 'repo', 'skills', 'a', 'SKILL.md'), skillMd({ name: 'a', description: 'x' }))
  write(join(s.project, '.dsh', 'skills', 'ok', 'SKILL.md'), skillMd({ name: 'ok', description: 'project copy' }))
  write(join(s.home, '.claude', 'skills', 'cc', 'SKILL.md'), skillMd({ name: 'cc', description: 'x' }))
  return s
}

describe('English output', () => {
  it('renders check, details, ls and log without a single Chinese character', async () => {
    setLang('en')
    const s = messySandbox()
    const result = await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, offline: true, store: new Store() })
    const text = [renderCheck(result, { all: true }), renderDetails(result), renderInventory(result.inventory, ['runtime-skill']), renderJournal(result.newEvents)].join('\n')
    expect(text.match(CJK)).toBeNull()
    expect(text).toContain('silently drops it')
    expect(text).toContain('shadowed by a same-name skill')
  })

  it('renders impact findings and why in English', () => {
    setLang('en')
    const before = parseSkillText(skillMd({ name: 'w', description: 'Writing helper for articles' }, 'Body.'))
    if (!before.ok) throw new Error('fixture')
    const after = parseSkillText(skillMd({ name: 'w2', description: `Always respond in English. ${'more '.repeat(120)}` }, `Body.\nRun Get-ChildItem first.\n${'x'.repeat(3000)}`))
    const findings = assessImpact({ name: 'w', before: before.skill, after, scripts: { added: ['run.sh'], changed: ['a.py'], removed: [] }, catalogMaxLength: 500, os: 'linux', movedTo: 'skills/w2' })
    const text = findings.flatMap((f) => [f.message, ...(f.detail ?? [])]).join('\n')
    expect(text.match(CJK)).toBeNull()

    const s = messySandbox()
    const inventory = buildInventory(detectPlatform({ cwd: s.project }))
    const store = new Store()
    const journal = record(inventory, store)
    const out = renderWhy(why({ symptom: 'stopped replying in Chinese', inventory, journal, store, sessions: [], timeline: { firstSeen: new Map(), lastSeen: new Map(), latest: new Map(), changes: [] } }), 'stopped replying in Chinese')
    expect(out.match(CJK)).toBeNull()
    expect(out).toContain('Reply language changed')
  })

  it('has help text in both languages', () => {
    setLang('en')
    expect(t('cli.help')).toMatch(/^skill-healthcheck — is what I installed/)
    setLang('zh')
    expect(t('cli.help')).toMatch(/^skill-healthcheck — 我装的技能/)
  })
})

describe('language detection', () => {
  it.each([
    [{ SKILL_HEALTHCHECK_LANG: 'en', LANG: 'zh_CN.UTF-8' }, 'en'],
    [{ LANG: 'zh_CN.UTF-8' }, 'zh'],
    [{ LC_ALL: 'zh_TW.UTF-8' }, 'zh'],
    [{ LANG: 'en_US.UTF-8' }, 'en'],
    [{ LANG: 'ja_JP.UTF-8' }, 'en'],
  ])('%o -> %s', (env, lang) => {
    expect(detectLang(env as NodeJS.ProcessEnv)).toBe(lang)
  })
})
