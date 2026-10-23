// Backfill from dsh session logs. dsh already records, with timestamps, every skill
// catalog the model was shown and every skill invocation, so history before the first
// skill-healthcheck run is not lost. Only derived facts are cached; no conversation text
// leaves this module.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import type { Store } from './journal.js'

export interface CatalogSnapshot {
  t: number
  entries: Array<{ name: string; description: string }>
}

export interface SkillCall {
  t: number
  name: string
  via: 'model' | 'user'
}

export interface DayStats {
  userZh: number
  userLatin: number
  asstZh: number
  asstLatin: number
  asstMessages: number
  userMessages: number
}

export interface SessionSummary {
  id: string
  cwd?: string
  createdAt?: number
  lastAt?: number
  catalogs: CatalogSnapshot[]
  skillCalls: SkillCall[]
  /** Keyed by local date YYYY-MM-DD. */
  days: Record<string, DayStats>
}

interface CacheFile {
  v: 1
  files: Record<string, { size: number; mtimeMs: number; summary: SessionSummary }>
}

const CACHE_NAME = 'sessions-cache.json'

export function loadSessions(sessionsDir: string | undefined, store?: Store): SessionSummary[] {
  if (!sessionsDir) return []
  const files = findSessionFiles(sessionsDir)
  const cache: CacheFile = store?.readJsonFile<CacheFile>(CACHE_NAME) ?? { v: 1, files: {} }
  const next: CacheFile = { v: 1, files: {} }
  const out: SessionSummary[] = []
  let dirty = false
  for (const file of files) {
    let info
    try {
      info = statSync(file)
    } catch {
      continue
    }
    const cached = cache.files[file]
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
      next.files[file] = cached
      out.push(cached.summary)
      continue
    }
    const summary = summarizeSessionFile(file)
    if (!summary) continue
    dirty = true
    next.files[file] = { size: info.size, mtimeMs: info.mtimeMs, summary }
    out.push(summary)
  }
  if (store && (dirty || Object.keys(cache.files).length !== Object.keys(next.files).length)) store.writeJsonFile(CACHE_NAME, next)
  return out.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

function findSessionFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string, depth: number) => {
    if (depth > 4) return
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(current, name)
      if (/^session\.v\d+\.jsonl(\.zstd)?$/.test(name)) out.push(full)
      else if (!name.includes('.')) walk(full, depth + 1)
    }
  }
  walk(dir, 0)
  return out.sort()
}

export function summarizeSessionFile(file: string): SessionSummary | undefined {
  let text: string
  try {
    const buf = readFileSync(file)
    text = file.endsWith('.zstd') ? zstdDecompressSync(buf).toString('utf8') : buf.toString('utf8')
  } catch {
    return undefined
  }
  return summarizeSessionLines(text.split('\n'))
}

export function summarizeSessionLines(lines: string[]): SessionSummary {
  const summary: SessionSummary = { id: '', catalogs: [], skillCalls: [], days: {} }
  for (const line of lines) {
    if (!line) continue
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const t: number | undefined = typeof o.time === 'number' ? o.time : undefined
    if (t !== undefined) summary.lastAt = Math.max(summary.lastAt ?? 0, t)
    switch (o.type) {
      case 'session':
        summary.id = String(o.id ?? '')
        summary.cwd = typeof o.cwd === 'string' ? o.cwd : undefined
        summary.createdAt = typeof o.createdAt === 'number' ? o.createdAt : undefined
        break
      case 'user/message': {
        const source = o.data?.source
        if (t === undefined) break
        if (source?.kind === 'skill-catalog' && Array.isArray(source.entries)) {
          summary.catalogs.push({
            t,
            entries: source.entries
              .filter((e: any) => typeof e?.name === 'string')
              .map((e: any) => ({ name: e.name, description: String(e.description ?? '') })),
          })
        } else if (source?.kind === 'skill-invocation' && typeof source.name === 'string') {
          summary.skillCalls.push({ t, name: source.name, via: 'user' })
        } else if (source?.kind === 'user') {
          const stats = day(summary, t)
          const lang = languageCounts(textOf(o.data?.content))
          stats.userZh += lang.zh
          stats.userLatin += lang.latin
          stats.userMessages++
        }
        break
      }
      case 'tool/call':
        if (t !== undefined && o.data?.name === 'skill') {
          const name = argName(o.data.arguments)
          if (name) summary.skillCalls.push({ t, name, via: 'model' })
        }
        break
      case 'assistant/message': {
        if (t === undefined) break
        const content = o.data?.message?.content
        const text = textOf(content)
        if (!text) break
        const stats = day(summary, t)
        const lang = languageCounts(text)
        stats.asstZh += lang.zh
        stats.asstLatin += lang.latin
        stats.asstMessages++
        break
      }
    }
  }
  return summary
}

function argName(args: unknown): string | undefined {
  try {
    const parsed = typeof args === 'string' ? JSON.parse(args) : args
    return typeof parsed?.name === 'string' ? parsed.name : undefined
  } catch {
    return undefined
  }
}

/** Visible text only: reasoning and tool calls are excluded. */
function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((c: any) => c?.type === 'text' && typeof c.text === 'string' && !c.text.startsWith('<system-reminder>'))
    .map((c: any) => c.text)
    .join('\n')
}

/** Chinese characters vs. Latin words, ignoring fenced code. */
export function languageCounts(text: string): { zh: number; latin: number } {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  const zh = prose.match(/[一-鿿]/g)?.length ?? 0
  const latin = prose.match(/[A-Za-z]{2,}/g)?.length ?? 0
  return { zh, latin }
}

/** Share of Chinese in a text sample, 0..1; undefined when there's too little text to say. */
export function zhShare(zh: number, latin: number): number | undefined {
  if (zh + latin < 10) return undefined
  return zh / (zh + latin)
}

function day(summary: SessionSummary, t: number): DayStats {
  const key = localDay(t)
  return (summary.days[key] ??= { userZh: 0, userLatin: 0, asstZh: 0, asstLatin: 0, asstMessages: 0, userMessages: 0 })
}

export function localDay(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---- derived views ----

export interface DescriptionChange {
  name: string
  /** First catalog that showed the new description. */
  t: number
  /** Last catalog that still showed the old one. */
  prevT: number
  from: string
  to: string
}

export interface CatalogTimeline {
  firstSeen: Map<string, number>
  lastSeen: Map<string, number>
  latest: Map<string, string>
  changes: DescriptionChange[]
}

/** What the model was shown over time, per skill name. */
export function catalogTimeline(sessions: SessionSummary[]): CatalogTimeline {
  const catalogs = sessions.flatMap((s) => s.catalogs).sort((a, b) => a.t - b.t)
  const firstSeen = new Map<string, number>()
  const lastSeen = new Map<string, number>()
  const latest = new Map<string, string>()
  const latestAt = new Map<string, number>()
  const changes: DescriptionChange[] = []
  for (const catalog of catalogs) {
    for (const { name, description } of catalog.entries) {
      if (!firstSeen.has(name)) firstSeen.set(name, catalog.t)
      lastSeen.set(name, catalog.t)
      const prev = latest.get(name)
      if (prev !== undefined && prev !== description) {
        changes.push({ name, t: catalog.t, prevT: latestAt.get(name) ?? catalog.t, from: prev, to: description })
      }
      latest.set(name, description)
      latestAt.set(name, catalog.t)
    }
  }
  return { firstSeen, lastSeen, latest, changes }
}

export interface UsageStats {
  name: string
  calls: number
  lastCall?: number
  /** Sessions that started after the last call and still showed this skill in their catalog. */
  quietSessions: number
}

export function usageStats(sessions: SessionSummary[], name: string): UsageStats {
  const calls = sessions.flatMap((s) => s.skillCalls).filter((c) => c.name === name)
  const lastCall = calls.length ? Math.max(...calls.map((c) => c.t)) : undefined
  const quietSessions =
    lastCall === undefined
      ? 0
      : sessions.filter((s) => (s.createdAt ?? 0) > lastCall && s.catalogs.some((c) => c.entries.some((e) => e.name === name))).length
  return { name, calls: calls.length, lastCall, quietSessions }
}

/** Per-day share of Chinese in assistant replies, and in user messages. */
export function languageByDay(sessions: SessionSummary[]): Array<{ day: string; asst?: number; user?: number }> {
  const merged = new Map<string, DayStats>()
  for (const s of sessions) {
    for (const [key, d] of Object.entries(s.days)) {
      const m = merged.get(key) ?? { userZh: 0, userLatin: 0, asstZh: 0, asstLatin: 0, asstMessages: 0, userMessages: 0 }
      m.userZh += d.userZh
      m.userLatin += d.userLatin
      m.asstZh += d.asstZh
      m.asstLatin += d.asstLatin
      m.asstMessages += d.asstMessages
      m.userMessages += d.userMessages
      merged.set(key, m)
    }
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, d]) => ({ day: key, asst: zhShare(d.asstZh, d.asstLatin), user: zhShare(d.userZh, d.userLatin) }))
}
