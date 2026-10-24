import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildInventory } from '../src/discover.js'
import { Store } from '../src/journal.js'
import { detectPlatform } from '../src/platforms.js'
import { catalogTimeline, loadSessions, summarizeClaudeCodeLines, summarizeCodexLines } from '../src/sessions.js'
import { why } from '../src/why.js'
import { sandbox, skillMd, write } from './helpers.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T10:00:00Z')
const iso = (t: number) => new Date(t).toISOString()
const jsonl = (records: object[]) => records.map((r) => JSON.stringify(r)).join('\n')

/** Claude Code transcript records, in the shapes Claude Code writes (verified against real transcripts). */
function claudeSession(id: string, t: number, opts: { listing: Record<string, [string, string]>; reply: string; calls?: string[]; slash?: string }) {
  const names = Object.keys(opts.listing)
  return [
    { type: 'attachment', timestamp: iso(t), sessionId: id, cwd: '/w', attachment: { type: 'skill_listing', content: names.map((n) => `- ${n}: ${opts.listing[n]![0]}`).join('\n'), skillCount: names.length, isInitial: true, names, digests: names.map((n) => opts.listing[n]![1]) } },
    { type: 'user', timestamp: iso(t + 1), sessionId: id, cwd: '/w', origin: { kind: 'human' }, message: { role: 'user', content: [{ type: 'text', text: '帮我把这次的需求整理成一份文档，写清楚背景和目标。' }] } },
    ...(opts.slash ? [{ type: 'user', timestamp: iso(t + 2), sessionId: id, message: { role: 'user', content: `<command-message>${opts.slash}</command-message>\n<command-name>/${opts.slash}</command-name>` } }] : []),
    {
      type: 'assistant',
      timestamp: iso(t + 3),
      sessionId: id,
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: '' }, ...(opts.calls ?? []).map((s) => ({ type: 'tool_use', id: `t-${s}`, name: 'Skill', input: { skill: s } })), { type: 'text', text: opts.reply }] },
    },
  ]
}

/** Codex rollout records, in the shapes codex-rs writes (render.rs / fragments.rs). */
function codexSession(id: string, t: number, opts: { skills: Record<string, string>; reply: string; readSkill?: string; mention?: string }) {
  const lines = Object.entries(opts.skills).map(([n, d]) => `- ${n}: ${d} (file: /home/u/.codex/skills/${n}/SKILL.md)`)
  const catalog = ['## Skills', 'A skill is a set of local instructions…', '### Available skills', ...lines].join('\n')
  return [
    { timestamp: iso(t), type: 'session_meta', payload: { id, timestamp: iso(t), cwd: '/w' } },
    { timestamp: iso(t + 1), type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: catalog }] } },
    { timestamp: iso(t + 2), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '帮我把这次的需求整理成一份文档，写清楚背景和目标。' }] } },
    ...(opts.mention ? [{ timestamp: iso(t + 3), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `<skill>\n<name>${opts.mention}</name>\n<path>/home/u/.codex/skills/${opts.mention}/SKILL.md</path>\n…</skill>` }] } }] : []),
    ...(opts.readSkill ? [{ timestamp: iso(t + 4), type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['bash', '-lc', `cat /home/u/.codex/skills/${opts.readSkill}/SKILL.md`] }), call_id: 'c1' } }] : []),
    { timestamp: iso(t + 5), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: opts.reply }] } },
  ]
}

const ZH = '好的，我把需求整理成了文档，分为背景、目标、验收标准三部分，你看看哪里需要调整。'
const EN = 'Sure. I organized the requirements into a document with background, goals and acceptance criteria. Let me know what to adjust.'

describe('Claude Code backfill', () => {
  it('reads the skill listing, Skill tool calls, typed /commands and reply language', () => {
    const s = summarizeClaudeCodeLines(jsonl(claudeSession('a', T0, { listing: { 'doc-writer': ['Write docs', 'd1'] }, reply: ZH, calls: ['doc-writer'], slash: 'doc-writer' })).split('\n'))
    expect(s.format).toBe('claude-code')
    expect(s.catalogs[0]!.entries).toEqual([{ name: 'doc-writer', description: 'Write docs', digest: 'd1' }])
    expect(s.skillCalls.map((c) => [c.name, c.via])).toEqual([
      ['doc-writer', 'user'],
      ['doc-writer', 'model'],
    ])
    expect(Object.values(s.days)[0]!.asstZh).toBeGreaterThan(20)
    expect(Object.values(s.days)[0]!.userZh).toBeGreaterThan(10)
  })

  it('uses digests to date a description change even when the listing text was cut', () => {
    const lines = [
      ...claudeSession('a', T0, { listing: { x: ['Old text', 'd1'] }, reply: ZH }),
      ...claudeSession('b', T0 + DAY, { listing: { x: ['', 'd1'] }, reply: ZH }), // listing truncated: no text, same digest
      ...claudeSession('c', T0 + 2 * DAY, { listing: { x: ['', 'd2'] }, reply: ZH }), // digest changed
    ]
    const tl = catalogTimeline([summarizeClaudeCodeLines(jsonl(lines).split('\n'))])
    expect(tl.changes.map((c) => c.t)).toEqual([T0 + 2 * DAY])
  })
})

describe('Codex backfill', () => {
  it('reads the skills block, $skill mentions, SKILL.md reads and reply language', () => {
    const s = summarizeCodexLines(jsonl(codexSession('r1', T0, { skills: { 'doc-writer': 'Write docs', other: 'Other' }, reply: EN, readSkill: 'doc-writer', mention: 'other' })).split('\n'))
    expect(s.format).toBe('codex')
    expect(s.id).toBe('r1')
    expect(s.catalogs[0]!.entries).toEqual([
      { name: 'doc-writer', description: 'Write docs' },
      { name: 'other', description: 'Other' },
    ])
    expect(s.skillCalls.map((c) => [c.name, c.via])).toEqual([
      ['other', 'user'],
      ['doc-writer', 'model'],
    ])
    expect(Object.values(s.days)[0]!.asstLatin).toBeGreaterThan(10)
  })

  it('reports a real edit but not a catalog cut', () => {
    const shortEdit = [...codexSession('a', T0, { skills: { x: 'Write clear documents for requirements' }, reply: EN }), ...codexSession('b', T0 + DAY, { skills: { x: 'Write clear documents' }, reply: EN })]
    expect(catalogTimeline([summarizeCodexLines(jsonl(shortEdit).split('\n'))]).changes).toHaveLength(1)

    // A listing cut at the cap leaves the beginning of the text and ends with an ellipsis.
    const cut = [...codexSession('c', T0, { skills: { x: 'Write clear documents for requirements' }, reply: EN }), ...codexSession('d', T0 + DAY, { skills: { x: 'Write clear documents for requirements…' }, reply: EN })]
    expect(catalogTimeline([summarizeCodexLines(jsonl(cut).split('\n'))]).changes).toEqual([])

    // The same holds for a long prefix that is almost certainly a cut at a catalog cap.
    const long = 'A'.repeat(300)
    const capped = [...codexSession('e', T0, { skills: { x: `${long} and more` }, reply: EN }), ...codexSession('f', T0 + DAY, { skills: { x: long }, reply: EN })]
    expect(catalogTimeline([summarizeCodexLines(jsonl(capped).split('\n'))]).changes).toEqual([])
  })
})

describe('why: a skill stopped triggering', () => {
  it('suspects a plugin-provided skill whose description changed, even with no keyword hits', () => {
    const lines = [
      ...claudeSession('a', T0, { listing: { 'plug:report': ['Generate weekly reports from tickets', 'd1'] }, reply: EN, calls: ['plug:report'] }),
      ...claudeSession('b', T0 + DAY, { listing: { 'plug:report': ['Generate weekly reports from tickets', 'd1'] }, reply: EN, calls: ['plug:report'] }),
      ...claudeSession('c', T0 + 2 * DAY, { listing: { 'plug:report': ['Summarize Jira sprints', 'd2'] }, reply: EN }),
      ...claudeSession('d', T0 + 3 * DAY, { listing: { 'plug:report': ['Summarize Jira sprints', 'd2'] }, reply: EN }),
      ...claudeSession('e', T0 + 4 * DAY, { listing: { 'plug:report': ['Summarize Jira sprints', 'd2'] }, reply: EN }),
    ]
    const sessions = ['a', 'b', 'c', 'd', 'e'].map((id) => summarizeClaudeCodeLines(jsonl(lines.filter((l: any) => l.sessionId === id)).split('\n')))
    const s = sandbox('generic')
    const result = why({ symptom: '最近不怎么用技能了', inventory: buildInventory(detectPlatform({ cwd: s.project })), journal: [], store: new Store(), sessions, timeline: catalogTimeline(sessions) })
    expect(result.symptoms.map((x) => x.id)).toContain('skill-not-triggered')
    expect(result.suspects[0]).toMatchObject({ name: 'plug:report' })
    expect(result.suspects[0]!.change).toEqual({ from: 'Generate weekly reports from tickets', to: 'Summarize Jira sprints' })
  })
})

describe('generic platform end to end', () => {
  it('finds Claude Code and Codex logs on disk and attributes a language switch', () => {
    const s = sandbox('generic')
    const claudeDir = join(s.home, '.claude', 'projects', 'D--work')
    for (let d = 0; d < 10; d++) {
      const updated = d >= 6
      const listing: Record<string, [string, string]> = {
        'doc-writer': [updated ? 'Turn requirements into documents. Always respond in English using professional tone.' : 'Turn requirements into a clearly structured document', updated ? 'v2' : 'v1'],
      }
      write(join(claudeDir, `0000000${d}-aaaa-bbbb-cccc-dddddddddddd.jsonl`), jsonl(claudeSession(`s${d}`, T0 + d * DAY, { listing, reply: updated ? EN : ZH, calls: ['doc-writer'] })))
    }
    write(join(s.home, '.codex', 'sessions', '2026', '10', '01', 'rollout-2026-10-01T10-00-00-r1.jsonl'), jsonl(codexSession('r1', T0, { skills: { 'doc-writer': 'Turn requirements into a clearly structured document' }, reply: ZH })))
    write(join(s.home, '.claude', 'skills', 'doc-writer', 'SKILL.md'), skillMd({ name: 'doc-writer', description: 'Turn requirements into documents. Always respond in English using professional tone.' }))

    const platform = detectPlatform({ cwd: s.project })
    expect(platform.sessionSources.map((x) => x.format)).toEqual(['claude-code', 'codex'])
    const store = new Store()
    const sessions = loadSessions(platform.sessionSources, store)
    expect(sessions.map((x) => x.format).sort()).toEqual([...Array(10).fill('claude-code'), 'codex'])
    const inventory = buildInventory(platform)
    const result = why({ symptom: 'why is it answering in English now', inventory, journal: [], store, sessions, timeline: catalogTimeline(sessions) })
    expect(result.onset).toBeDefined()
    expect(result.suspects[0]).toMatchObject({ name: 'doc-writer' })
    // cached on the second load
    expect(loadSessions(platform.sessionSources, store)).toHaveLength(11)
  })
})
