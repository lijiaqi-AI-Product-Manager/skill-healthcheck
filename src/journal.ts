// The recorder. Every run snapshots what is installed, diffs it against the previous
// snapshot and appends what changed to an append-only journal. Full SKILL.md texts go
// into a content-addressed blob store so later diffs (and `why`) can see old versions.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listScripts } from './discover.js'
import { dataHome, nowMs } from './env.js'
import type { Inventory, SkillEntry } from './types.js'

export interface SkillState {
  key: string
  name: string
  status: 'active' | 'shadowed' | 'dropped'
  source: string
  rank: number
  sha: string
  description?: string
  bodyChars: number
  scripts: Record<string, string>
  modelInvocable?: boolean
  userInvocable?: boolean
  /** Best guess of when the file first appeared (birthtime, else mtime). */
  fileTime: number
  /** Last modification: when this version landed on disk (git pull rewrites it). */
  mtime: number
}

export interface Snapshot {
  v: 1
  t: number
  platform: string
  skills: Record<string, SkillState>
}

export type JournalKind = 'baseline' | 'added' | 'changed' | 'removed' | 'moved' | 'status' | 'adopted' | 'upstream-changed'

export interface StateDiff {
  nameChanged?: { from: string; to: string }
  descriptionChanged?: boolean
  bodyDelta?: number
  scriptsAdded?: string[]
  scriptsRemoved?: string[]
  scriptsChanged?: string[]
  statusChanged?: { from: string; to: string }
  invocationChanged?: boolean
}

export interface JournalEvent {
  v: 1
  /** When it happened (best estimate). */
  t: number
  /** When skill-healthcheck noticed it. */
  observedAt: number
  /** True when `t` is inferred from file times rather than observed. */
  estimated: boolean
  kind: JournalKind
  key: string
  name: string
  source?: string
  before?: SkillState
  after?: SkillState
  diff?: StateDiff
  origin: 'scan' | 'plugin-hook' | 'upstream' | 'cli'
  note?: string
}

export class Store {
  readonly dir: string
  constructor(dir = dataHome()) {
    this.dir = dir
  }

  get journalFile() {
    return join(this.dir, 'journal.jsonl')
  }

  private get snapshotFile() {
    return join(this.dir, 'snapshot.json')
  }

  ensure() {
    mkdirSync(join(this.dir, 'blobs'), { recursive: true })
  }

  readSnapshot(): Snapshot | undefined {
    return readJson<Snapshot>(this.snapshotFile)
  }

  writeSnapshot(snapshot: Snapshot) {
    this.ensure()
    writeFileSync(this.snapshotFile, JSON.stringify(snapshot, null, 1))
  }

  append(events: JournalEvent[]) {
    if (events.length === 0) return
    this.ensure()
    appendFileSync(this.journalFile, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }

  readJournal(): JournalEvent[] {
    if (!existsSync(this.journalFile)) return []
    const out: JournalEvent[] = []
    for (const line of readFileSync(this.journalFile, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        out.push(JSON.parse(line))
      } catch {
        // a torn last line from an interrupted write; skip it
      }
    }
    return out
  }

  putBlob(text: string): string {
    const sha = sha256(text)
    const file = join(this.dir, 'blobs', `${sha}.md`)
    if (!existsSync(file)) {
      this.ensure()
      writeFileSync(file, text)
    }
    return sha
  }

  getBlob(sha: string): string | undefined {
    try {
      return readFileSync(join(this.dir, 'blobs', `${sha}.md`), 'utf8')
    } catch {
      return undefined
    }
  }

  readJsonFile<T>(name: string): T | undefined {
    return readJson<T>(join(this.dir, name))
  }

  writeJsonFile(name: string, value: unknown) {
    this.ensure()
    writeFileSync(join(this.dir, name), JSON.stringify(value, null, 1))
  }
}

export function stateOf(entry: SkillEntry, status: SkillState['status'], store: Store): SkillState {
  const sha = store.putBlob(entry.raw)
  const scripts: Record<string, string> = {}
  for (const rel of listScripts(entry)) {
    try {
      scripts[rel] = gitBlobSha(readFileSync(join(entry.dir, 'scripts', rel)))
    } catch {
      // unreadable script: record nothing rather than a fake hash
    }
  }
  const parsed = entry.parse.ok ? entry.parse.skill : undefined
  const state: SkillState = {
    key: entry.file,
    name: parsed?.name ?? (entry.parse.ok ? entry.entryName : (entry.parse.rawName ?? entry.entryName.replace(/\.md$/, ''))),
    status,
    source: entry.root.source,
    rank: entry.root.rank,
    sha,
    bodyChars: parsed?.body.length ?? 0,
    scripts,
    ...fileTimes(entry),
  }
  if (parsed) {
    state.description = parsed.description
    state.modelInvocable = parsed.invocation.modelInvocable
    state.userInvocable = parsed.invocation.userInvocable
  }
  return state
}

export function snapshotOf(inventory: Inventory, store: Store, t = nowMs()): Snapshot {
  const skills: Record<string, SkillState> = {}
  for (const s of inventory.active) skills[s.file] = stateOf(s, 'active', store)
  for (const s of inventory.shadowed) skills[s.file] = stateOf(s, 'shadowed', store)
  for (const s of inventory.dropped) skills[s.file] = stateOf(s, 'dropped', store)
  return { v: 1, t, platform: inventory.platform.id, skills }
}

/** Diff two snapshots into journal events. Pure: no I/O. */
export function diffSnapshots(prev: Snapshot | undefined, cur: Snapshot, origin: JournalEvent['origin'] = 'scan'): JournalEvent[] {
  const now = cur.t
  const events: JournalEvent[] = []
  const base = (kind: JournalKind, s: SkillState, t: number, estimated: boolean): JournalEvent => ({
    v: 1,
    t,
    observedAt: now,
    estimated,
    kind,
    key: s.key,
    name: s.name,
    source: s.source,
    origin,
  })
  if (!prev) {
    for (const s of Object.values(cur.skills)) {
      events.push({ ...base('baseline', s, Math.min(s.fileTime, now), true), after: s, note: '首次记录时已存在，时间取自文件时间' })
    }
    return events.sort((a, b) => a.t - b.t)
  }
  const clamp = (t: number) => Math.min(Math.max(t, prev.t), now)
  const removedKeys = Object.keys(prev.skills).filter((k) => !cur.skills[k])
  const addedKeys = Object.keys(cur.skills).filter((k) => !prev.skills[k])
  const movedFrom = new Map<string, string>()
  for (const added of addedKeys) {
    const a = cur.skills[added]!
    const match = removedKeys.find((r) => !movedFrom.has(r) && (prev.skills[r]!.sha === a.sha || prev.skills[r]!.name === a.name))
    if (match) movedFrom.set(match, added)
  }
  for (const [from, to] of movedFrom) {
    const before = prev.skills[from]!
    const after = cur.skills[to]!
    events.push({ ...base('moved', after, clamp(after.mtime), true), before, after, diff: diffStates(before, after), note: `${from} -> ${to}` })
  }
  for (const key of removedKeys) {
    if (movedFrom.has(key)) continue
    const before = prev.skills[key]!
    events.push({ ...base('removed', before, now, true), before, note: '删除时间介于上次记录和本次之间' })
  }
  const movedTargets = new Set(movedFrom.values())
  for (const key of addedKeys) {
    if (movedTargets.has(key)) continue
    const after = cur.skills[key]!
    events.push({ ...base('added', after, clamp(after.fileTime), true), after })
  }
  for (const [key, after] of Object.entries(cur.skills)) {
    const before = prev.skills[key]
    if (!before) continue
    const diff = diffStates(before, after)
    const contentChanged = before.sha !== after.sha || diff.scriptsAdded || diff.scriptsRemoved || diff.scriptsChanged
    if (contentChanged) {
      events.push({ ...base('changed', after, clamp(after.mtime), true), before, after, diff })
    } else if (diff.statusChanged) {
      events.push({ ...base('status', after, now, false), before, after, diff })
    }
  }
  return events.sort((a, b) => a.t - b.t)
}

export function diffStates(before: SkillState, after: SkillState): StateDiff {
  const diff: StateDiff = {}
  if (before.name !== after.name) diff.nameChanged = { from: before.name, to: after.name }
  if ((before.description ?? '') !== (after.description ?? '')) diff.descriptionChanged = true
  if (before.bodyChars !== after.bodyChars) diff.bodyDelta = after.bodyChars - before.bodyChars
  const added = Object.keys(after.scripts).filter((f) => !(f in before.scripts))
  const removed = Object.keys(before.scripts).filter((f) => !(f in after.scripts))
  const changed = Object.keys(after.scripts).filter((f) => f in before.scripts && before.scripts[f] !== after.scripts[f])
  if (added.length) diff.scriptsAdded = added
  if (removed.length) diff.scriptsRemoved = removed
  if (changed.length) diff.scriptsChanged = changed
  if (before.status !== after.status) diff.statusChanged = { from: before.status, to: after.status }
  if (before.modelInvocable !== after.modelInvocable || before.userInvocable !== after.userInvocable) diff.invocationChanged = true
  return diff
}

/** Snapshot the inventory, append the diff to the journal, return the new events. */
export function record(inventory: Inventory, store = new Store(), origin: JournalEvent['origin'] = 'scan'): JournalEvent[] {
  const prev = store.readSnapshot()
  const cur = snapshotOf(inventory, store)
  const events = diffSnapshots(prev, cur, origin)
  store.append(events)
  store.writeSnapshot(cur)
  return events
}

export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Same id `git hash-object` gives, so local scripts compare directly with upstream trees. */
export function gitBlobSha(content: Buffer): string {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex')
}

function fileTimes(entry: SkillEntry): { fileTime: number; mtime: number } {
  try {
    const info = statSync(entry.file)
    // birthtime ~ install time on Windows/macOS; Linux often reports 0, fall back to mtime.
    const fileTime = info.birthtimeMs > 0 ? Math.min(info.birthtimeMs, info.mtimeMs) : info.mtimeMs
    return { fileTime, mtime: info.mtimeMs }
  } catch {
    const now = nowMs()
    return { fileTime: now, mtime: now }
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}
