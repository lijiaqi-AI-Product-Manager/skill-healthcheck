// Upstream liveness. Works against any git host (GitHub, Gitee, a local bare repo) using
// a private blobless cache clone, so the user's own checkouts are never fetched into or
// modified. A network failure is never reported as "deleted": only an explicit not-found
// (confirmed via the GitHub API for github.com) counts.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseSkillText, type ParseResult } from './frontmatter.js'
import { git } from './git.js'
import type { Store } from './journal.js'
import type { InstalledSkill, PlatformInfo } from './types.js'

export type Provenance =
  | { kind: 'git'; url: string; subpath: string; ref?: string; via: 'adopt' | 'metadata' | 'checkout'; localRepo?: string }
  | { kind: 'bundled' }
  | { kind: 'project'; repo: string }
  | { kind: 'unknown' }

export interface AdoptedSource {
  url: string
  subpath: string
  ref?: string
  adoptedAt: number
}

export type SourcesFile = Record<string, AdoptedSource>

export const SOURCES_FILE = 'sources.json'

/** Parse "github:owner/repo/path@ref", GitHub tree URLs, or "<git-url>#<path>". */
export function parseSourceSpec(spec: string): { url: string; subpath: string; ref?: string } | undefined {
  const s = spec.trim()
  if (!s) return undefined
  let m = /^github:([\w.-]+)\/([\w.-]+)(?:\/([^@]*))?(?:@(.+))?$/.exec(s)
  if (m) return { url: `https://github.com/${m[1]}/${m[2]!.replace(/\.git$/, '')}.git`, subpath: trimSlashes(m[3] ?? ''), ref: m[4] }
  m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/(?:tree|blob)\/([^/]+)\/?(.*)$/.exec(s)
  if (m) {
    const path = trimSlashes(m[4] ?? '').replace(/\/?SKILL\.md$/, '')
    return { url: `https://github.com/${m[1]}/${m[2]}.git`, subpath: path, ref: m[3] }
  }
  m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(s)
  if (m) return { url: `https://github.com/${m[1]}/${m[2]}.git`, subpath: '' }
  const hash = s.lastIndexOf('#')
  if (hash > 0) return { url: s.slice(0, hash), subpath: trimSlashes(s.slice(hash + 1)) }
  return { url: s, subpath: '' }
}

export async function resolveProvenance(skill: InstalledSkill, platform: PlatformInfo, sources: SourcesFile): Promise<Provenance> {
  if (skill.root.bundled) return { kind: 'bundled' }
  const adopted = sources[skill.skill.name] ?? sources[skill.file]
  if (adopted) return { kind: 'git', url: adopted.url, subpath: adopted.subpath, ref: adopted.ref, via: 'adopt' }
  const meta = skill.skill.metadata?.source
  if (typeof meta === 'string') {
    const spec = parseSourceSpec(meta)
    if (spec) return { kind: 'git', ...spec, via: 'metadata' }
  }
  const top = await git(['-C', skill.dir, 'rev-parse', '--show-toplevel'], { timeoutMs: 10_000 })
  if (!top.ok) return { kind: 'unknown' }
  const repo = resolve(top.stdout.trim())
  if (samePath(repo, platform.projectRoot) && !samePath(repo, skill.dir)) return { kind: 'project', repo }
  const remote = await git(['-C', repo, 'config', '--get', 'remote.origin.url'], { timeoutMs: 10_000 })
  if (!remote.ok || !remote.stdout.trim()) return { kind: 'unknown' }
  // git reports the real path; resolve ours too, or /var vs /private/var (macOS tmp) and
  // 8.3 short names like C:\Users\RUNNER~1 (Windows) break relative(). Only .native expands 8.3.
  const target = realpathSync.native(skill.kind === 'bundle' ? skill.dir : skill.file)
  const subpath = relative(realpathSync.native(repo), target).replaceAll('\\', '/')
  if (subpath.startsWith('..')) return { kind: 'unknown' }
  return { kind: 'git', url: remote.stdout.trim(), subpath, via: 'checkout', localRepo: repo }
}

export interface ScriptDiff {
  added: string[]
  changed: string[]
  removed: string[]
}

export type UpstreamResult =
  | { state: 'current'; commit: string }
  | {
      state: 'changed'
      commit: string
      date?: string
      raw: string
      parse: ParseResult
      scripts: ScriptDiff
      /** Set when the skill now lives at another path in the repo. */
      movedTo?: string
      localModified?: boolean
    }
  | { state: 'removed-in-repo'; commit: string; date?: string }
  | { state: 'repo-missing'; detail: string }
  | { state: 'repo-moved'; newUrl: string }
  | { state: 'unreachable'; detail: string }

interface FetchedRepo {
  ok: true
  gitDir: string
  commit: string
}

type FetchOutcome = FetchedRepo | { ok: false; result: UpstreamResult }

/** One fetch per repo per run, shared across the skills that come from it. */
export class UpstreamChecker {
  private fetches = new Map<string, Promise<FetchOutcome>>()
  constructor(private store: Store, private options: { offline?: boolean } = {}) {}

  async check(skill: InstalledSkill, prov: Extract<Provenance, { kind: 'git' }>): Promise<UpstreamResult> {
    if (this.options.offline) return { state: 'unreachable', detail: '离线模式，未检查' }
    const key = `${prov.url}@${prov.ref ?? 'HEAD'}`
    let fetching = this.fetches.get(key)
    if (!fetching) {
      fetching = this.fetch(prov.url, prov.ref)
      this.fetches.set(key, fetching)
    }
    const repo = await fetching
    if (!repo.ok) return repo.result
    return compareSkill(repo, skill, prov)
  }

  private async fetch(url: string, ref?: string): Promise<FetchOutcome> {
    const gitDir = join(this.store.dir, 'cache', `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.git`)
    if (!existsSync(gitDir)) {
      mkdirSync(join(this.store.dir, 'cache'), { recursive: true })
      const init = await git(['init', '--bare', '--quiet', gitDir])
      if (!init.ok) return { ok: false, result: { state: 'unreachable', detail: firstLine(init.stderr) } }
    }
    const fetched = await git(['--git-dir', gitDir, 'fetch', '--quiet', '--no-tags', '--filter=blob:none', url, ref ?? 'HEAD'], { timeoutMs: 120_000 })
    if (!fetched.ok) return { ok: false, result: await classifyFetchFailure(url, fetched.stderr) }
    const head = await git(['--git-dir', gitDir, 'rev-parse', 'FETCH_HEAD'])
    if (!head.ok) return { ok: false, result: { state: 'unreachable', detail: firstLine(head.stderr) } }
    return { ok: true, gitDir, commit: head.stdout.trim() }
  }
}

async function compareSkill(repo: FetchedRepo, skill: InstalledSkill, prov: Extract<Provenance, { kind: 'git' }>): Promise<UpstreamResult> {
  const { gitDir, commit } = repo
  const file = skillFilePath(prov.subpath, skill.kind)
  const shown = await git(['--git-dir', gitDir, 'show', `${commit}:${file}`], { timeoutMs: 60_000 })
  if (shown.ok) {
    return diffAgainstLocal(repo, skill, prov, prov.subpath, shown.stdout)
  }
  // Path is gone upstream: moved/renamed or deleted?
  const moved = await findMovedSkill(gitDir, commit, skill)
  if (moved) {
    const raw = await git(['--git-dir', gitDir, 'show', `${commit}:${moved.file}`], { timeoutMs: 60_000 })
    if (raw.ok) {
      const result = await diffAgainstLocal(repo, skill, prov, moved.subpath, raw.stdout)
      if (result.state === 'current') return { ...result }
      if (result.state === 'changed') return { ...result, movedTo: moved.subpath || '/' }
      return result
    }
  }
  const log = await git(['--git-dir', gitDir, 'log', '-1', '--format=%H%x09%cI', commit, '--', file], { timeoutMs: 60_000 })
  const [deletedIn, date] = log.stdout.trim().split('\t')
  return { state: 'removed-in-repo', commit: deletedIn || commit, date }
}

async function diffAgainstLocal(
  repo: FetchedRepo,
  skill: InstalledSkill,
  prov: Extract<Provenance, { kind: 'git' }>,
  subpath: string,
  upstreamRaw: string,
): Promise<UpstreamResult> {
  const { gitDir, commit } = repo
  const scripts = await scriptDiff(gitDir, commit, subpath, skill)
  if (normalize(upstreamRaw) === normalize(skill.raw) && !scripts.added.length && !scripts.changed.length && !scripts.removed.length) {
    return { state: 'current', commit }
  }
  const file = skillFilePath(subpath, skill.kind)
  const log = await git(['--git-dir', gitDir, 'log', '-1', '--format=%cI', commit, '--', file], { timeoutMs: 60_000 })
  let localModified: boolean | undefined
  if (prov.localRepo) {
    const local = await git(['-C', prov.localRepo, 'show', `HEAD:${skillFilePath(prov.subpath, skill.kind)}`])
    if (local.ok) localModified = normalize(local.stdout) !== normalize(skill.raw)
  }
  return {
    state: 'changed',
    commit,
    date: log.stdout.trim() || undefined,
    raw: upstreamRaw,
    parse: parseSkillText(upstreamRaw),
    scripts,
    localModified,
  }
}

async function scriptDiff(gitDir: string, commit: string, subpath: string, skill: InstalledSkill): Promise<ScriptDiff> {
  const local = await localScriptShas(skill)
  if (skill.kind !== 'bundle') return { added: [], changed: [], removed: [] }
  const prefix = subpath ? `${subpath}/scripts/` : 'scripts/'
  const tree = await git(['--git-dir', gitDir, 'ls-tree', '-r', commit, '--', prefix], { timeoutMs: 60_000 })
  const upstream: Record<string, string> = {}
  for (const line of tree.stdout.split('\n')) {
    const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line)
    if (m) upstream[m[2]!.slice(prefix.length)] = m[1]!
  }
  return {
    added: Object.keys(upstream).filter((f) => !(f in local)).sort(),
    changed: Object.keys(upstream).filter((f) => f in local && local[f] !== upstream[f]).sort(),
    removed: Object.keys(local).filter((f) => !(f in upstream)).sort(),
  }
}

async function localScriptShas(skill: InstalledSkill): Promise<Record<string, string>> {
  const { listScripts } = await import('./discover.js')
  const { gitBlobSha } = await import('./journal.js')
  const { readFileSync } = await import('node:fs')
  const out: Record<string, string> = {}
  for (const rel of listScripts(skill)) {
    try {
      // Hash with LF endings: that's what's in the repo when autocrlf rewrote the checkout.
      const buf = readFileSync(join(skill.dir, 'scripts', rel))
      out[rel] = gitBlobSha(buf)
      const lf = Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
      if (lf.length !== buf.length) out[rel] = gitBlobSha(lf)
    } catch {
      // unreadable: treat as absent
    }
  }
  return out
}

async function findMovedSkill(gitDir: string, commit: string, skill: InstalledSkill): Promise<{ subpath: string; file: string } | undefined> {
  const tree = await git(['--git-dir', gitDir, 'ls-tree', '-r', '--name-only', commit], { timeoutMs: 60_000 })
  if (!tree.ok) return undefined
  const candidates = tree.stdout
    .split('\n')
    .filter((p) => p === 'SKILL.md' || p.endsWith('/SKILL.md'))
    .slice(0, 300)
  if (candidates.length === 0) return undefined
  const batch = await git(['--git-dir', gitDir, 'cat-file', '--batch'], { input: candidates.map((p) => `${commit}:${p}`).join('\n') + '\n', timeoutMs: 120_000 })
  if (!batch.ok) return undefined
  const blobs = splitCatFileBatch(batch.stdout)
  let best: { file: string; score: number } | undefined
  candidates.forEach((file, i) => {
    const raw = blobs[i]
    if (raw === undefined) return
    const parsed = parseSkillText(raw)
    const score = parsed.ok && parsed.skill.name === skill.skill.name ? 1 : similarity(raw, skill.raw)
    if (!best || score > best.score) best = { file, score }
  })
  const found = best as { file: string; score: number } | undefined
  if (!found || found.score < 0.6) return undefined
  return { file: found.file, subpath: found.file === 'SKILL.md' ? '' : found.file.slice(0, -'/SKILL.md'.length) }
}

function splitCatFileBatch(out: string): Array<string | undefined> {
  const result: Array<string | undefined> = []
  let pos = 0
  const buf = Buffer.from(out, 'utf8')
  while (pos < buf.length) {
    const nl = buf.indexOf(0x0a, pos)
    if (nl < 0) break
    const header = buf.subarray(pos, nl).toString('utf8')
    const m = /^[0-9a-f]+ blob (\d+)$/.exec(header)
    if (!m) {
      result.push(undefined) // "<obj> missing"
      pos = nl + 1
      continue
    }
    const size = Number(m[1])
    result.push(buf.subarray(nl + 1, nl + 1 + size).toString('utf8'))
    pos = nl + 1 + size + 1
  }
  return result
}

/** Jaccard similarity over line sets; good enough to recognise a moved file. */
export function similarity(a: string, b: string): number {
  const la = new Set(normalize(a).split('\n').map((l) => l.trim()).filter(Boolean))
  const lb = new Set(normalize(b).split('\n').map((l) => l.trim()).filter(Boolean))
  if (la.size === 0 || lb.size === 0) return 0
  let common = 0
  for (const l of la) if (lb.has(l)) common++
  return common / (la.size + lb.size - common)
}

async function classifyFetchFailure(url: string, stderr: string): Promise<UpstreamResult> {
  const detail = firstLine(stderr.replace(/^(remote|fatal): /gm, ''))
  const gh = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url)
  const notFound = /repository '.*' not found|Repository not found|does not appear to be a git repository|not found/i.test(stderr)
  const authOrMissing = /could not read Username|Authentication failed|terminal prompts disabled|Permission denied|403/i.test(stderr)
  if (gh && (notFound || authOrMissing)) {
    const api = await githubRepoStatus(gh[1]!, gh[2]!)
    if (api.state === 'missing') return { state: 'repo-missing', detail: 'GitHub 返回 404（已删除或已转为私有）' }
    if (api.state === 'moved') return { state: 'repo-moved', newUrl: api.newUrl }
    if (api.state === 'exists') return { state: 'unreachable', detail }
    return { state: 'unreachable', detail: `${detail}；GitHub API 也无法确认` }
  }
  if (notFound && !/Could not resolve host|timed out|Connection refused|unable to access/i.test(stderr)) {
    return { state: 'repo-missing', detail }
  }
  return { state: 'unreachable', detail }
}

async function githubRepoStatus(owner: string, repo: string): Promise<{ state: 'exists' | 'missing' | 'unknown' } | { state: 'moved'; newUrl: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'skill-healthcheck', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 404) return { state: 'missing' }
    if (res.status === 301 || res.status === 302 || res.status === 307) {
      const follow = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: { 'User-Agent': 'skill-healthcheck' }, signal: AbortSignal.timeout(10_000) })
      const data: any = await follow.json().catch(() => undefined)
      if (data?.html_url) return { state: 'moved', newUrl: String(data.html_url) }
      return { state: 'unknown' }
    }
    if (res.ok) return { state: 'exists' }
    return { state: 'unknown' }
  } catch {
    return { state: 'unknown' }
  }
}

function skillFilePath(subpath: string, kind: InstalledSkill['kind']): string {
  if (kind === 'flat') return subpath
  return subpath ? `${subpath}/SKILL.md` : 'SKILL.md'
}

export function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '')
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync.native(p)
    } catch {
      return resolve(p)
    }
  }
  return real(a).toLowerCase() === real(b).toLowerCase()
}

function firstLine(s: string): string {
  return s.trim().split('\n')[0] ?? ''
}
