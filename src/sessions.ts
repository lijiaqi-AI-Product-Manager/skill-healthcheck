// Backfill from agent session logs. dsh, Claude Code and Codex all record, with
// timestamps, the skill catalog the model was shown and every skill invocation, so
// history before the first skill-healthcheck run is not lost. Only derived facts are
// cached; no conversation text leaves this module.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as zlib from 'node:zlib'
import type { Store } from './journal.js'

/**
 * Node added zstd to node:zlib in 22.15. Importing the name statically makes the whole CLI
 * fail to load on 22.13/22.14 (the ESM linker checks named exports before main() runs), so
 * read it off the namespace instead: older runtimes get a clear version message from the CLI
 * rather than a SyntaxError, and this module still loads for `--version` / `--help`.
 */
const zstdDecompress: ((buffer: Buffer) => Buffer) | undefined = (
  zlib as unknown as { zstdDecompressSync?: (buffer: Buffer) => Buffer }
).zstdDecompressSync

/** True when this Node can read dsh's compressed session logs. */
export function zstdSupported(): boolean {
  return typeof zstdDecompress === 'function'
}

export type SessionFormat = 'dsh' | 'claude-code' | 'codex'

export interface SessionSource {
  dir: string
  format: SessionFormat
}

export interface CatalogEntry {
  name: string
  description: string
  /** Claude Code ships a per-skill digest; when present it decides "changed" instead of the (possibly truncated) text. */
  digest?: string
}

export interface CatalogSnapshot {
  t: number
  entries: CatalogEntry[]
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
  format?: SessionFormat
  cwd?: string
  createdAt?: number
  lastAt?: number
  catalogs: CatalogSnapshot[]
  skillCalls: SkillCall[]
  /** Keyed by local date YYYY-MM-DD. */
  days: Record<string, DayStats>
}

interface CacheFile {
  v: 2
  files: Record<string, { size: number; mtimeMs: number; summary: SessionSummary }>
}

const CACHE_NAME = 'sessions-cache.json'
const DEFAULT_SESSION_DAYS = 180
/** Larger logs are skipped rather than read into memory whole. */
const MAX_SESSION_BYTES = 256 * 1024 * 1024

/** A plain directory means dsh's layout (kept for callers from before multi-agent support). */
export function loadSessions(sources: SessionSource[] | string | undefined, store?: Store): SessionSummary[] {
  const list: SessionSource[] = typeof sources === 'string' ? [{ dir: sources, format: 'dsh' }] : (sources ?? [])
  if (list.length === 0) return []
  const read = store?.readJsonFile<CacheFile>(CACHE_NAME)
  const cache: CacheFile = read?.v === 2 ? read : { v: 2, files: {} }
  const next: CacheFile = { v: 2, files: {} }
  const out: SessionSummary[] = []
  let dirty = false
  // Heavy users have thousands of transcripts; old history rarely explains today's behavior.
  const days = Number(process.env.SKILL_HEALTHCHECK_SESSION_DAYS) || DEFAULT_SESSION_DAYS
  const since = Date.now() - days * 86_400_000
  for (const source of list) {
    for (const file of findSessionFiles(source)) {
      let info
      try {
        info = statSync(file)
      } catch {
        continue
      }
      if (info.mtimeMs < since || info.size > MAX_SESSION_BYTES) continue
      const cached = cache.files[file]
      if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
        next.files[file] = cached
        out.push(cached.summary)
        continue
      }
      const summary = summarizeSessionFile(file, source.format)
      if (!summary) continue
      dirty = true
      next.files[file] = { size: info.size, mtimeMs: info.mtimeMs, summary }
      out.push(summary)
    }
  }
  if (store && (dirty || Object.keys(cache.files).length !== Object.keys(next.files).length)) {
    // The cache is an optimization; a read-only data directory must not fail the check.
    try {
      store.writeJsonFile(CACHE_NAME, next)
    } catch {
      // next run re-parses: slower, still correct
    }
  }
  return out.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

const FILE_PATTERNS: Record<SessionFormat, { name: RegExp; maxDepth: number }> = {
  // ~/.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd
  dsh: { name: /^session\.v\d+\.jsonl(\.zstd)?$/, maxDepth: 4 },
  // ~/.claude/projects/<project>/<session>.jsonl
  'claude-code': { name: /^[0-9a-f-]{8,}\.jsonl$/i, maxDepth: 1 },
  // ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl
  codex: { name: /^rollout-.*\.jsonl$/, maxDepth: 4 },
}

/** Directories never worth descending into inside a sessions tree. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache'])

function findSessionFiles(source: SessionSource): string[] {
  const { name: pattern, maxDepth } = FILE_PATTERNS[source.format]
  const out: string[] = []
  const walk = (current: string, depth: number) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const name = entry.name
      const full = join(current, name)
      if (pattern.test(name)) out.push(full)
      // Test the entry, not the name: `ws.v2` and `my.project` are normal workspace names,
      // and skipping every dotted name silently dropped Claude Code history for those projects.
      else if (depth < maxDepth && entry.isDirectory() && !SKIP_DIRS.has(name)) walk(full, depth + 1)
    }
  }
  walk(source.dir, 0)
  return out.sort()
}

export function summarizeSessionFile(file: string, format: SessionFormat = 'dsh'): SessionSummary | undefined {
  let text: string
  try {
    const buf = readFileSync(file)
    if (!file.endsWith('.zstd')) text = buf.toString('utf8')
    else if (zstdDecompress) text = zstdDecompress(buf).toString('utf8')
    else return undefined // pre-22.15 Node: the CLI has already told the user to upgrade
  } catch {
    return undefined
  }
  const lines = text.split('\n')
  if (format === 'claude-code') return summarizeClaudeCodeLines(lines)
  if (format === 'codex') return summarizeCodexLines(lines)
  return summarizeSessionLines(lines)
}

/** dsh session.v4 records. */
export function summarizeSessionLines(lines: string[]): SessionSummary {
  const summary: SessionSummary = { id: '', format: 'dsh', catalogs: [], skillCalls: [], days: {} }
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

/**
 * Claude Code transcripts (~/.claude/projects/<project>/<session>.jsonl): the catalog is a
 * `skill_listing` attachment ("- name: description" lines plus per-skill digests); the model
 * calls the `Skill` tool with `{ skill }`; a typed `/name` shows up as <command-name>.
 */
export function summarizeClaudeCodeLines(lines: string[]): SessionSummary {
  const summary: SessionSummary = { id: '', format: 'claude-code', catalogs: [], skillCalls: [], days: {} }
  for (const line of lines) {
    if (!line) continue
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const t = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN
    if (Number.isNaN(t)) continue
    if (!summary.id && typeof o.sessionId === 'string') summary.id = o.sessionId
    if (!summary.cwd && typeof o.cwd === 'string') summary.cwd = o.cwd
    summary.createdAt = Math.min(summary.createdAt ?? t, t)
    summary.lastAt = Math.max(summary.lastAt ?? t, t)

    if (o.type === 'attachment' && o.attachment?.type === 'skill_listing') {
      const att = o.attachment
      const described = new Map<string, string>()
      for (const m of String(att.content ?? '').matchAll(/^- (\S+?): (.*)$/gm)) described.set(m[1]!, m[2]!.trim())
      const names: string[] = Array.isArray(att.names) ? att.names.filter((n: unknown) => typeof n === 'string') : [...described.keys()]
      const digests: unknown[] = Array.isArray(att.digests) ? att.digests : []
      const entries = names.map((name, i) => {
        const entry: CatalogEntry = { name, description: described.get(name) ?? '' }
        if (typeof digests[i] === 'string') entry.digest = digests[i] as string
        return entry
      })
      if (entries.length) summary.catalogs.push({ t, entries })
      continue
    }
    const content = o.message?.content
    if (o.type === 'assistant' && Array.isArray(content)) {
      for (const c of content) {
        if (c?.type === 'tool_use' && c.name === 'Skill' && typeof c.input?.skill === 'string') summary.skillCalls.push({ t, name: c.input.skill, via: 'model' })
      }
      addLanguage(summary, t, 'asst', textOf(content))
      continue
    }
    if (o.type === 'user') {
      const text = typeof content === 'string' ? content : textOf(content)
      const command = /<command-name>\/?([^<\s]+)<\/command-name>/.exec(text)
      if (command) summary.skillCalls.push({ t, name: command[1]!, via: 'user' })
      else if (!o.isMeta && (o.origin === undefined || o.origin?.kind === 'human') && !text.trimStart().startsWith('<')) addLanguage(summary, t, 'user', text)
    }
  }
  return summary
}

const CODEX_LOCATOR = /\((?:file|executor package|cloud package|custom resource): ([^)]+)\)\s*$/

/**
 * Codex rollouts (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl): the catalog is a
 * "## Skills" block of "- name: description (file: path)" lines; a user's `$skill` mention is
 * injected as a <skill><name>…</name> fragment; the model "invokes" a skill by reading its
 * SKILL.md through a tool call.
 */
export function summarizeCodexLines(lines: string[]): SessionSummary {
  const summary: SessionSummary = { id: '', format: 'codex', catalogs: [], skillCalls: [], days: {} }
  const byPath = new Map<string, string>()
  for (const line of lines) {
    if (!line) continue
    let o: any
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const t = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : NaN
    if (Number.isNaN(t)) continue
    summary.createdAt = Math.min(summary.createdAt ?? t, t)
    summary.lastAt = Math.max(summary.lastAt ?? t, t)
    const p = o.payload
    if (!p || typeof p !== 'object') continue
    if (o.type === 'session_meta') {
      if (typeof p.id === 'string') summary.id = p.id
      if (typeof p.cwd === 'string') summary.cwd = p.cwd
      continue
    }
    if (o.type !== 'response_item') continue
    if (p.type === 'message' && Array.isArray(p.content)) {
      for (const c of p.content) {
        const text = typeof c?.text === 'string' ? c.text : ''
        if (!text) continue
        if (text.includes('### Available skills')) {
          const entries: CatalogEntry[] = []
          for (const raw of text.split('\n')) {
            const m = /^- (\S+?): (.*)$/.exec(raw.trim())
            if (!m) continue
            const locator = CODEX_LOCATOR.exec(m[2]!)
            if (!locator) continue
            const description = m[2]!.slice(0, locator.index).trim()
            entries.push({ name: m[1]!, description })
            byPath.set(normalizePath(locator[1]!), m[1]!)
          }
          if (entries.length) summary.catalogs.push({ t, entries })
        } else if (text.includes('<skill>')) {
          const name = /<name>([^<]+)<\/name>/.exec(text)?.[1]
          if (name) summary.skillCalls.push({ t, name: name.trim(), via: 'user' })
        } else if (p.role === 'assistant') {
          addLanguage(summary, t, 'asst', text)
        } else if (p.role === 'user' && !text.trimStart().startsWith('<')) {
          addLanguage(summary, t, 'user', text)
        }
      }
      continue
    }
    if (p.type === 'function_call' || p.type === 'local_shell_call' || p.type === 'custom_tool_call') {
      const args = normalizePath(JSON.stringify(p))
      let name: string | undefined
      for (const [path, skill] of byPath) if (args.includes(path)) name = skill
      name ??= /([\w.-]+)\/SKILL\.md/.exec(args)?.[1]
      if (name) summary.skillCalls.push({ t, name, via: 'model' })
    }
  }
  return summary
}

function normalizePath(s: string): string {
  return s.replace(/\\\\/g, '/').replace(/\\/g, '/')
}

function addLanguage(summary: SessionSummary, t: number, who: 'user' | 'asst', text: string) {
  if (!text) return
  const stats = day(summary, t)
  const lang = languageCounts(text)
  if (who === 'user') {
    stats.userZh += lang.zh
    stats.userLatin += lang.latin
    stats.userMessages++
  } else {
    stats.asstZh += lang.zh
    stats.asstLatin += lang.latin
    stats.asstMessages++
  }
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
  const latestEntry = new Map<string, CatalogEntry>()
  const latestAt = new Map<string, number>()
  const changes: DescriptionChange[] = []
  for (const catalog of catalogs) {
    for (const entry of catalog.entries) {
      const { name } = entry
      if (!firstSeen.has(name)) firstSeen.set(name, catalog.t)
      lastSeen.set(name, catalog.t)
      const prev = latestEntry.get(name)
      if (prev && entryChanged(prev, entry)) {
        changes.push({ name, t: catalog.t, prevT: latestAt.get(name) ?? catalog.t, from: prev.description, to: entry.description })
      }
      latestEntry.set(name, entry.description || !prev ? entry : { ...entry, description: prev.description })
      if (entry.description) latest.set(name, entry.description)
      latestAt.set(name, catalog.t)
    }
  }
  return { firstSeen, lastSeen, latest, changes }
}

/**
 * Digests decide when both sides have one. Otherwise compare text, but a catalog that cut a
 * description shorter (Codex bounds its list, dsh caps at 500) is not a change.
 */
function entryChanged(a: CatalogEntry, b: CatalogEntry): boolean {
  if (a.digest && b.digest) return a.digest !== b.digest
  if (!a.description || !b.description) return false
  if (a.description === b.description) return false
  const strip = (s: string) => s.replace(/(\.\.\.|…)$/, '').trim()
  const x = strip(a.description)
  const y = strip(b.description)
  return !(x.startsWith(y) || y.startsWith(x))
}

export interface UsageStats {
  name: string
  calls: number
  lastCall?: number
  /** Sessions that started after the last call and still showed this skill in their catalog. */
  quietSessions: number
}

/** Sessions that saw a skill in their catalog without calling it: the bar for "went quiet". */
export const QUIET_SESSIONS = 3

interface UsageIndex {
  calls: Map<string, { count: number; last?: number }>
  /** Per skill name: creation time of every session whose catalog listed it. */
  shown: Map<string, number[]>
}

const usageIndexes = new WeakMap<SessionSummary[], UsageIndex>()

/** One pass over all sessions; `usageStats` used to re-flatten every call for every skill. */
function usageIndexOf(sessions: SessionSummary[]): UsageIndex {
  const cached = usageIndexes.get(sessions)
  if (cached) return cached
  const index: UsageIndex = { calls: new Map(), shown: new Map() }
  for (const session of sessions) {
    for (const call of session.skillCalls) {
      const entry = index.calls.get(call.name) ?? { count: 0 }
      entry.count++
      if (entry.last === undefined || call.t > entry.last) entry.last = call.t
      index.calls.set(call.name, entry)
    }
    const listed = new Set(session.catalogs.flatMap((c) => c.entries.map((e) => e.name)))
    for (const name of listed) {
      const times = index.shown.get(name) ?? []
      times.push(session.createdAt ?? 0)
      index.shown.set(name, times)
    }
  }
  usageIndexes.set(sessions, index)
  return index
}

export function usageStats(sessions: SessionSummary[], name: string): UsageStats {
  const index = usageIndexOf(sessions)
  const call = index.calls.get(name)
  const lastCall = call?.last
  const quietSessions = lastCall === undefined ? 0 : (index.shown.get(name) ?? []).filter((createdAt) => createdAt > lastCall).length
  return { name, calls: call?.count ?? 0, lastCall, quietSessions }
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
