import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { usageFindings } from '../src/checks.js'
import { buildInventory } from '../src/discover.js'
import { Store } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { catalogTimeline, summarizeSessionLines, type SessionSummary } from '../src/sessions.js'
import { languageOnset, matchSymptoms, why } from '../src/why.js'
import { sandbox, skillMd, write } from './helpers.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T10:00:00')

/** A synthetic dsh session log, in the real v4 record shapes. */
function session(id: string, t: number, opts: { catalog: Record<string, string>; reply: string; calls?: string[] }): SessionSummary {
  const lines = [
    { type: 'session', version: 4, id, createdAt: t, cwd: '/w' },
    { type: 'user/message', time: t + 1, data: { content: [{ type: 'text', text: '<system-reminder>…' }], source: { kind: 'skill-catalog', form: 'catalog', entries: Object.entries(opts.catalog).map(([name, description]) => ({ name, description })) } } },
    { type: 'user/message', time: t + 2, data: { content: [{ type: 'text', text: '帮我把这段需求整理成一份文档，写清楚背景和目标，用中文。' }], source: { kind: 'user' } } },
    ...(opts.calls ?? []).map((name, i) => ({ type: 'tool/call', time: t + 3 + i, data: { name: 'skill', arguments: JSON.stringify({ name }) } })),
    { type: 'assistant/message', time: t + 10, data: { message: { role: 'assistant', content: [{ type: 'reasoning', text: 'ignored' }, { type: 'text', text: opts.reply }] } } },
  ]
  return summarizeSessionLines(lines.map((l) => JSON.stringify(l)))
}

const ZH_REPLY = '好的，我已经把需求整理成文档，包含背景、目标和验收标准三个部分，请看下面的内容并告诉我需要调整的地方。'
const EN_REPLY = 'Sure. I have organized the requirements into a document with background, goals and acceptance criteria. Please review the content below and let me know what to adjust.'

function history() {
  const sessions: SessionSummary[] = []
  for (let d = 0; d < 6; d++) sessions.push(session(`s${d}`, T0 + d * DAY, { catalog: { 'doc-writer': '整理需求文档', 'zh-style': '中文写作风格' }, reply: ZH_REPLY, calls: ['zh-style'] }))
  for (let d = 6; d < 10; d++) {
    sessions.push(session(`s${d}`, T0 + d * DAY, { catalog: { 'doc-writer': 'Turn requirements into documents. Always respond in English using professional tone.', 'zh-style': '中文写作风格' }, reply: EN_REPLY }))
  }
  return sessions
}

describe('session backfill', () => {
  it('extracts catalogs, skill calls and language stats', () => {
    const s = session('x', T0, { catalog: { a: 'A' }, reply: ZH_REPLY, calls: ['a'] })
    expect(s.catalogs[0]!.entries).toEqual([{ name: 'a', description: 'A' }])
    expect(s.skillCalls).toMatchObject([{ name: 'a', via: 'model' }])
    expect(Object.values(s.days)[0]!.asstZh).toBeGreaterThan(30)
  })

  it('finds the description change the model saw', () => {
    const tl = catalogTimeline(history())
    expect(tl.changes).toMatchObject([{ name: 'doc-writer', t: T0 + 6 * DAY + 1 }])
  })

  it('finds the day replies stopped being Chinese', () => {
    expect(new Date(languageOnset(history())!.t).getDate()).toBe(new Date(T0 + 6 * DAY).getDate())
  })
})

describe('why', () => {
  it('maps a Chinese complaint to the language symptom', () => {
    expect(matchSymptoms('为什么它现在不用中文回答我了').map((s) => s.id)).toContain('language')
  })

  it('ranks the skill whose description started demanding English first', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'Turn requirements into documents. Always respond in English using professional tone.' }))
    write(join(s.DSH_HOME, 'skills', 'zh-style', 'SKILL.md'), skillMd({ name: 'zh-style', description: '中文写作风格' }))
    const inventory = buildInventory(detectPlatform({ cwd: s.project }))
    const sessions = history()
    const result = why({ symptom: '为什么它现在不用中文回答我了', inventory, journal: [], store: new Store(), sessions, timeline: catalogTimeline(sessions) })
    expect(result.onset).toBeDefined()
    expect(result.suspects[0]).toMatchObject({ name: 'doc-writer' })
    expect(result.suspects[0]!.evidence.join()).toMatch(/respond in English|professional tone/i)
  })

  it('turns a skill that went quiet after a catalog change into usage evidence', () => {
    const s = sandbox()
    write(join(s.DSH_HOME, 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'new' }))
    const inventory = buildInventory(detectPlatform({ cwd: s.project }))
    const sessions = [
      ...[0, 1, 2].map((d) => session(`a${d}`, T0 + d * DAY, { catalog: { 'doc-writer': 'old' }, reply: ZH_REPLY, calls: ['doc-writer'] })),
      ...[3, 4, 5, 6].map((d) => session(`b${d}`, T0 + d * DAY, { catalog: { 'doc-writer': 'new' }, reply: ZH_REPLY })),
    ]
    const findings = usageFindings(inventory, sessions, catalogTimeline(sessions))
    expect(findings).toMatchObject([{ code: 'went-quiet', severity: 'critical', subject: 'doc-writer' }])
  })
})
