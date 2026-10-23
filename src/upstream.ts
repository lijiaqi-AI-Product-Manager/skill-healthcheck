// Upstream liveness. Works against any git host (GitHub, Gitee, a local bare repo) using
// a private blobless cache clone, so the user's own checkouts are never fetched into or
// modified. A network failure is never reported as "deleted": only an explicit not-found
// (confirmed via the GitHub API for github.com) counts.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dialectOf, parseSkillText, type ParsedSkill, type ParseResult } from './frontmatter.js'
import { git } from './git.js'
import { t } from './i18n.js'
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

export interface RepoInfo {
  repo: string
  url?: string
}

/** Per-run memo: every skill inside one checkout shares these two git calls. */
export type ProvenanceCache = Map<string, Promise<RepoInfo | undefined>>

export async function resolveProvenance(skill: InstalledSkill, platform: PlatformInfo, sources: SourcesFile, cache?: ProvenanceCache): Promise<Provenance> {
  if (skill.root.bundled) return { kind: 'bundled' }
  const adopted = sources[skill.skill.name] ?? sources[skill.file]
  if (adopted) return { kind: 'git', url: adopted.url, subpath: adopted.subpath, ref: adopted.ref, via: 'adopt' }
  const meta = skill.skill.metadata?.source
  if (typeof meta === 'string') {
    const spec = parseSourceSpec(meta)
    if (spec) return { kind: 'git', ...spec, via: 'metadata' }
  }
  // Skills outside a checkout are the common case. Walking up for .git costs a few stats;
  // `git rev-parse` costs a process spawn per skill, which is 10-30ms each on Windows.
  const root = findGitRoot(skill.dir)
  if (!root) return { kind: 'unknown' }
  const info = await lookupRepo(root, cache)
  if (!info) return { kind: 'unknown' }
  const repo = info.repo
  if (samePath(repo, platform.projectRoot) && !samePath(repo, skill.dir)) return { kind: 'project', repo }
  if (!info.url) return { kind: 'unknown' }
  // git reports the real path; resolve ours too, or /var vs /private/var (macOS tmp) and
  // 8.3 short names like C:\Users\RUNNER~1 (Windows) break relative(). Only .native expands 8.3.
  const target = realpathSync.native(skill.kind === 'bundle' ? skill.dir : skill.file)
  const subpath = relative(realpathSync.native(repo), target).replaceAll('\\', '/')
  if (subpath.startsWith('..')) return { kind: 'unknown' }
  return { kind: 'git', url: info.url, subpath, via: 'checkout', localRepo: repo }
}

async function lookupRepo(root: string, cache?: ProvenanceCache): Promise<RepoInfo | undefined> {
  const cached = cache?.get(root)
  if (cached) return cached
  const pending = (async (): Promise<RepoInfo | undefined> => {
    const top = await git(['-C', root, 'rev-parse', '--show-toplevel'], { timeoutMs: 10_000 })
    if (!top.ok) return undefined
    const repo = resolve(top.stdout.trim())
    const remote = await git(['-C', repo, 'config', '--get', 'remote.origin.url'], { timeoutMs: 10_000 })
    return { repo, url: remote.ok && remote.stdout.trim() ? remote.stdout.trim() : undefined }
  })()
  cache?.set(root, pending)
  return pending
}

/** Nearest ancestor (or the directory itself) that holds a .git entry; undefined outside a checkout. */
export function findGitRoot(dir: string): string | undefined {
  let current = resolve(dir)
  while (true) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
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

/**
 * Upstream URLs can come from a third-party SKILL.md (metadata.source), so treat them as
 * hostile: no option-looking values (git would run `--upload-pack=<cmd>`), no transport
 * helpers like `ext::`, only network URLs, scp-style ssh, or absolute local paths.
 */
export function isSafeGitUrl(url: string): boolean {
  if (!url || url.startsWith('-') || /[\0\r\n]/.test(url)) return false
  if (/^[a-z][a-z0-9+.-]*::/i.test(url)) return false
  if (/^(https?|ssh|git|file):\/\/[^\s]+$/i.test(url)) {
    if (/^file:\/\/-/i.test(url)) return false
    // A host that starts with "-" is an ssh option in disguise: ssh://-oProxyCommand=…
    try {
      if (new URL(url).hostname.startsWith('-')) return false
    } catch {
      return false
    }
    return true
  }
  // scp-style (git@host:path): the same option-injection risk lives in the user/host part.
  if (/^[\w.-]+@[\w.-]+:[^\s]+$/.test(url)) return !/@-/.test(url)
  return isAbsolute(url)
}

/** Strip `user:token@` before a URL reaches a report, a log or a CI artifact. */
export function redactUrl(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]+@/i, '$1***@')
}

/** The same, for a sentence that embeds a URL (git puts the remote in its stderr). */
export function redactText(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1***@')
}

export function redactProvenance(p: Provenance): Provenance {
  return p.kind === 'git' ? { ...p, url: redactUrl(p.url) } : p
}

export function isSafeRef(ref: string): boolean {
  return /^[\w][\w./-]*$/.test(ref) && !ref.includes('..')
}

/** One fetch per repo+ref per run, shared across the skills that come from it. */
export class UpstreamChecker {
  private fetches = new Map<string, Promise<FetchOutcome>>()
  /** Per cache repo: git takes locks, so fetches into the same repo must not overlap. */
  private queues = new Map<string, Promise<unknown>>()
  constructor(
    private store: Store,
    private options: { offline?: boolean; onFetch?: (url: string) => void } = {},
  ) {}

  async check(skill: InstalledSkill, prov: Extract<Provenance, { kind: 'git' }>): Promise<UpstreamResult> {
    if (this.options.offline) return { state: 'unreachable', detail: t('up.offline') }
    const repo = await this.fetchRepo(prov.url, prov.ref)
    if (!repo.ok) {
      // A source the skill's author wrote is not the user's invariant: a typo in someone
      // else's metadata.source must never turn into a critical "deleted repository" that
      // fails CI. A source the user registered with `adopt` still counts as gone.
      if (repo.result.state === 'repo-missing' && prov.via === 'metadata') return { state: 'unreachable', detail: repo.result.detail }
      return repo.result
    }
    return compareSkill(repo, skill, prov)
  }

  /** Fetch a repo into the cache (shared with check()). */
  async fetchRepo(url: string, ref?: string): Promise<FetchOutcome> {
    if (!isSafeGitUrl(url) || (ref !== undefined && !isSafeRef(ref))) {
      return { ok: false, result: { state: 'unreachable', detail: t('up.suspicious', redactUrl(url).slice(0, 80)) } }
    }
    const key = `${url}@${ref ?? 'HEAD'}`
    let fetching = this.fetches.get(key)
    if (!fetching) {
      fetching = this.serialized(cacheDirFor(this.store, url), () => this.fetch(url, ref))
      this.fetches.set(key, fetching)
    }
    return fetching
  }

  private serialized<T>(gitDir: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(gitDir) ?? Promise.resolve()
    const next = prev.then(task, task)
    this.queues.set(gitDir, next.catch(() => undefined))
    return next
  }

  private async fetch(url: string, ref?: string): Promise<FetchOutcome> {
    const gitDir = cacheDirFor(this.store, url)
    if (!existsSync(gitDir)) {
      mkdirSync(join(this.store.dir, 'cache'), { recursive: true })
      const init = await git(['init', '--bare', '--quiet', gitDir])
      if (!init.ok) return { ok: false, result: { state: 'unreachable', detail: redactText(firstLine(init.stderr)) } }
    }
    this.options.onFetch?.(url)
    // Fetch into our own ref rather than FETCH_HEAD, which the next fetch would overwrite.
    const local = `refs/shc/${createHash('sha1').update(ref ?? 'HEAD').digest('hex').slice(0, 12)}`
    const fetched = await git(
      ['--git-dir', gitDir, 'fetch', '--quiet', '--no-tags', '--filter=blob:none', '--end-of-options', url, `+${ref ?? 'HEAD'}:${local}`],
      { timeoutMs: 120_000 },
    )
    if (!fetched.ok) return { ok: false, result: await classifyFetchFailure(url, fetched.stderr) }
    const head = await git(['--git-dir', gitDir, 'rev-parse', '--verify', `${local}^{commit}`])
    if (!head.ok) return { ok: false, result: { state: 'unreachable', detail: redactText(firstLine(head.stderr)) } }
    return { ok: true, gitDir, commit: head.stdout.trim() }
  }
}

export interface RepoMatch {
  skill: InstalledSkill
  subpath: string
  by: 'name' | 'content'
  score: number
}

/**
 * Bulk adopt: match local skills against every SKILL.md in a repo, by frontmatter name
 * first and by content similarity otherwise. Most people copy skill folders out of a
 * repo, which leaves no .git behind; this restores their provenance in one step.
 */
export async function matchRepoSkills(
  checker: UpstreamChecker,
  spec: { url: string; subpath: string; ref?: string },
  skills: InstalledSkill[],
): Promise<{ ok: true; matches: RepoMatch[]; repoSkills: number; truncated: boolean } | { ok: false; result: UpstreamResult }> {
  const repo = await checker.fetchRepo(spec.url, spec.ref)
  if (!repo.ok) return repo
  const tree = await git(['--git-dir', repo.gitDir, 'ls-tree', '-r', '--name-only', repo.commit], { timeoutMs: 60_000 })
  const prefix = spec.subpath ? `${spec.subpath}/` : ''
  const all = tree.stdout.split('\n').filter((p) => (p === 'SKILL.md' || p.endsWith('/SKILL.md')) && p.startsWith(prefix))
  const files = all.slice(0, 5000)
  if (files.length === 0) return { ok: true, matches: [], repoSkills: 0, truncated: false }
  const batch = await git(['--git-dir', repo.gitDir, 'cat-file', '--batch'], { input: files.map((p) => `${repo.commit}:${p}`).join('\n') + '\n', timeoutMs: 300_000 })
  const blobs = splitCatFileBatch(batch.stdout)
  const upstream = files.map((file, i) => {
    const raw = blobs[i] ?? ''
    const subpath = subpathOf(file)
    // The most lenient reading: frontmatter name, else the folder name (Claude Code, Codex).
    const parsed = parseSkillText(raw, { dialect: 'claude-code', dirName: posix.basename(subpath) })
    return { subpath, raw, name: parsed.ok ? parsed.skill.name : undefined }
  })
  const matches: RepoMatch[] = []
  for (const skill of skills) {
    if (skill.kind !== 'bundle') continue
    const sameName = upstream.filter((u) => u.name === skill.skill.name)
    const pool = sameName.length ? sameName : upstream
    let best: { subpath: string; score: number } | undefined
    for (const u of pool) {
      const score = similarity(u.raw, skill.raw)
      if (!best || score > best.score) best = { subpath: u.subpath, score }
    }
    if (!best) continue
    if (sameName.length) matches.push({ skill, subpath: best.subpath, by: 'name', score: best.score })
    else if (best.score >= 0.6) matches.push({ skill, subpath: best.subpath, by: 'content', score: best.score })
  }
  return { ok: true, matches, repoSkills: files.length, truncated: all.length > files.length }
}

function cacheDirFor(store: Store, url: string): string {
  return join(store.dir, 'cache', `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.git`)
}

async function compareSkill(repo: FetchedRepo, skill: InstalledSkill, prov: Extract<Provenance, { kind: 'git' }>): Promise<UpstreamResult> {
  const { gitDir, commit } = repo
  const file = skillFilePath(prov.subpath, skill.kind)
  const shown = await showFile(gitDir, commit, file)
  if (shown.ok) return diffAgainstLocal(repo, skill, prov, prov.subpath, shown.raw)
  // A failed `git show` is "the path is gone" only for a specific class of errors. A blob
  // fetch that failed (blobless clone + flaky network) must never read as a deletion.
  if (!isMissingPath(shown.stderr)) return { state: 'unreachable', detail: redactText(firstLine(shown.stderr)) }
  // Path is gone upstream: moved/renamed or deleted? git's own rename detection goes first:
  // a renamed *and* rewritten skill still shows up as R087, where line similarity would not.
  const movedFile = (await findRenamedPath(gitDir, commit, file)) ?? (await findMovedSkill(gitDir, commit, skill))
  if (movedFile) {
    const raw = await showFile(gitDir, commit, movedFile)
    if (raw.ok) {
      const subpath = subpathOf(movedFile)
      const result = await diffAgainstLocal(repo, skill, prov, subpath, raw.raw)
      if (result.state === 'current') return result
      if (result.state === 'changed') return { ...result, movedTo: subpath || '/' }
      return result
    }
  }
  const log = await git(['--git-dir', gitDir, 'log', '-1', '--format=%H%x09%cI', commit, '--', file], { timeoutMs: 60_000 })
  const [deletedIn, date] = log.stdout.trim().split('\t')
  return { state: 'removed-in-repo', commit: deletedIn || commit, date }
}

async function showFile(gitDir: string, commit: string, file: string): Promise<{ ok: true; raw: string } | { ok: false; stderr: string }> {
  const shown = await git(['--git-dir', gitDir, 'show', `${commit}:${file}`], { timeoutMs: 60_000 })
  return shown.ok ? { ok: true, raw: shown.stdout } : { ok: false, stderr: shown.stderr }
}

/** Was the commit valuable and the path really absent, or did the read itself fail? */
function isMissingPath(stderr: string): boolean {
  if (/could not fetch|unable to fetch|unable to access|Could not resolve|timed out|RPC failed|early EOF|fetch-pack|Connection (refused|reset)|bad object/i.test(stderr)) return false
  return /does not exist in|exists on disk, but not in|path '.*' does not exist|Not a valid object name|invalid object name|no such path/i.test(stderr)
}

/** The path git recorded for a detected rename, if any commit that touched `file` renamed it. */
async function findRenamedPath(gitDir: string, commit: string, file: string): Promise<string | undefined> {
  const log = await git(['--git-dir', gitDir, 'log', '-1', '--format=%H', commit, '--', file], { timeoutMs: 60_000 })
  const sha = log.stdout.trim().split('\n')[0]
  if (!sha) return undefined
  const show = await git(['--git-dir', gitDir, 'show', '--name-status', '-M', '--format=', sha], { timeoutMs: 60_000 })
  if (!show.ok) return undefined
  for (const line of show.stdout.split('\n')) {
    const m = /^R\d+\t(.+)\t(.+)$/.exec(line.trim())
    if (m && m[1] === file) return m[2]
  }
  return undefined
}

/** `path/to/SKILL.md` -> `path/to`; a flat `.md` file keeps its full path. */
function subpathOf(file: string): string {
  if (file === 'SKILL.md') return ''
  return file.endsWith('/SKILL.md') ? file.slice(0, -'/SKILL.md'.length) : file
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
  if (sameSkillText(skill, upstreamRaw) &&!scripts.added.length && !scripts.changed.length && !scripts.removed.length) {
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
    parse: parseAsInstalled(skill, upstreamRaw),
    scripts,
    localModified,
  }
}

/**
 * Read upstream text the way this skill's agent will once it's installed: same dialect, and
 * the local folder name, which is what a name-less Claude Code or Codex skill is called.
 */
function parseAsInstalled(skill: InstalledSkill, raw: string): ParseResult {
  return parseSkillText(raw, { dialect: dialectOf(skill.root.agent), dirName: basename(skill.dir) })
}

/** Same content once line endings, a BOM and frontmatter-only metadata edits are ignored. */
function sameSkillText(skill: InstalledSkill, upstreamRaw: string): boolean {
  if (normalize(upstreamRaw) === normalize(skill.raw)) return true
  const up = parseAsInstalled(skill, upstreamRaw)
  if (!up.ok) return false
  return sameParsedSkill(up.skill, skill.skill)
}

/** Everything a check looks at; `metadata` (where adopt recommends recording the source) is not. */
function sameParsedSkill(a: ParsedSkill, b: ParsedSkill): boolean {
  return (
    a.name === b.name &&
    a.description === b.description &&
    a.whenToUse === b.whenToUse &&
    a.invocation.modelInvocable === b.invocation.modelInvocable &&
    a.invocation.userInvocable === b.invocation.userInvocable &&
    normalize(a.body) === normalize(b.body)
  )
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

async function findMovedSkill(gitDir: string, commit: string, skill: InstalledSkill): Promise<string | undefined> {
  const tree = await git(['--git-dir', gitDir, 'ls-tree', '-r', '--name-only', commit], { timeoutMs: 60_000 })
  if (!tree.ok) return undefined
  const candidates = tree.stdout
    .split('\n')
    // A flat skill is a bare `.md` file, so it can never match a `/SKILL.md` pattern.
    .filter((p) => (skill.kind === 'flat' ? p.endsWith('.md') : p === 'SKILL.md' || p.endsWith('/SKILL.md')))
    .slice(0, 2000)
  if (candidates.length === 0) return undefined
  const batch = await git(['--git-dir', gitDir, 'cat-file', '--batch'], { input: candidates.map((p) => `${commit}:${p}`).join('\n') + '\n', timeoutMs: 120_000 })
  if (!batch.ok) return undefined
  const blobs = splitCatFileBatch(batch.stdout)
  let best: { file: string; score: number } | undefined
  candidates.forEach((file, i) => {
    const raw = blobs[i]
    if (raw === undefined) return
    const parsed = parseSkillText(raw, { dialect: dialectOf(skill.root.agent), dirName: posix.basename(posix.dirname(file)) })
    const score = parsed.ok && parsed.skill.name === skill.skill.name ? 1 : similarity(raw, skill.raw)
    if (!best || score > best.score) best = { file, score }
  })
  const found = best as { file: string; score: number } | undefined
  if (!found || found.score < 0.6) return undefined
  return found.file
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
  const detail = redactText(firstLine(stderr.replace(/^(remote|fatal): /gm, '')))
  // A local source path: a typo is a configuration problem, not "the repository was deleted".
  // Keep it informational so a stray metadata.source never turns CI red.
  if (isAbsolute(url) || /^file:\/\//i.test(url)) {
    let path = url
    if (/^file:\/\//i.test(url)) {
      try {
        path = fileURLToPath(url)
      } catch {
        path = url
      }
    }
    if (!existsSync(path)) return { state: 'repo-missing', detail: t('up.localMissing', path) }
    return { state: 'unreachable', detail }
  }
  const gh = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url)
  const notFound = /repository '.*' not found|Repository not found|does not appear to be a git repository|not found/i.test(stderr)
  const authOrMissing = /could not read Username|Authentication failed|terminal prompts disabled|Permission denied|403/i.test(stderr)
  if (gh && (notFound || authOrMissing)) {
    const api = await githubRepoStatus(gh[1]!, gh[2]!)
    if (api.state === 'missing') return { state: 'repo-missing', detail: t('up.gh404') }
    if (api.state === 'moved') return { state: 'repo-moved', newUrl: api.newUrl }
    if (api.state === 'exists') return { state: 'unreachable', detail }
    return { state: 'unreachable', detail: t('up.ghUnknown', detail) }
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
  return text.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, '')
}

/** Paths are case-insensitive on Windows and (by default) macOS, and case-sensitive elsewhere. */
function foldCase(s: string): string {
  return process.platform === 'win32' || process.platform === 'darwin' ? s.toLowerCase() : s
}

function samePath(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync.native(p)
    } catch {
      return resolve(p)
    }
  }
  return foldCase(real(a)) === foldCase(real(b))
}

function firstLine(s: string): string {
  return s.trim().split('\n')[0] ?? ''
}
