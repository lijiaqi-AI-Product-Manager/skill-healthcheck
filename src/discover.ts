import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { dialectOf, parseSkillText } from './frontmatter.js'
import { t } from './i18n.js'
import type { InstalledSkill, Inventory, NestedSkillDir, PlatformInfo, ScanError, SkillEntry, SkillRoot } from './types.js'

const NESTED_SEARCH_DEPTH = 3
/** codex-rs ext/skills loader: MAX_SCAN_DEPTH (entries below the root) and MAX_SKILLS_DIRS_PER_ROOT. */
export const CODEX_SCAN_DEPTH = 6
const CODEX_MAX_DIRS = 2000

/**
 * List a root's skills the way its agent does. dsh and Claude Code read `<root>/<name>/SKILL.md`
 * (dsh also `<root>/<name>.md`); Codex walks the tree, skipping hidden folders.
 */
export function scanRoot(root: SkillRoot): { entries: SkillEntry[]; nested: NestedSkillDir[]; errors: ScanError[] } {
  const dialect = dialectOf(root.agent)
  if (dialect === 'codex') return scanCodexRoot(root)
  const entries: SkillEntry[] = []
  const nested: NestedSkillDir[] = []
  const errors: ScanError[] = []
  let names: string[]
  try {
    names = readdirSync(root.path)
  } catch (error) {
    // "No such directory" is normal (most project roots don't exist). Anything else means
    // the check could not see this root at all, which must not look like "all healthy".
    if (!isMissing(error)) errors.push({ path: root.path, reason: reasonOf(error) })
    return { entries, nested, errors }
  }
  const skip = new Set((root.skipDirs ?? []).map((d) => d.toLowerCase()))
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (root.skipSystem && name === '.system') continue
    if (skip.has(name.toLowerCase())) continue
    // Claude Code keeps its own bookkeeping in dot folders (~/.claude/skills/.trash).
    if (dialect === 'claude-code' && name.startsWith('.')) continue
    const full = join(root.path, name)
    const kind = entryKind(full)
    if (kind === 'directory') {
      const file = join(full, 'SKILL.md')
      const raw = readText(file, errors)
      if (raw === undefined) {
        if (!name.startsWith('.')) {
          const found = findNestedSkills(full, NESTED_SEARCH_DEPTH)
          if (found.length > 0) nested.push({ root, dir: full, found })
        }
        continue
      }
      // Claude Code reserves `synced` for skills it downloads from claude.ai and skips any other.
      const parse =
        dialect === 'claude-code' && name.toLowerCase() === 'synced'
          ? ({ ok: false, code: 'reserved-folder', reason: t('local.reservedFolder', name) } as const)
          : parseSkillText(raw, { dialect, dirName: name })
      entries.push({ root, entryName: name, file, dir: full, kind: 'bundle', raw, parse })
    } else if (dialect === 'dsh' && kind === 'file' && name.endsWith('.md')) {
      const raw = readText(full, errors)
      if (raw === undefined) continue
      entries.push({ root, entryName: name, file: full, dir: root.path, kind: 'flat', raw, parse: parseSkillText(raw) })
    }
  }
  return { entries, nested, errors }
}

/** codex-rs `discover_skills` in recursive mode: every SKILL.md up to six levels down, hidden folders pruned. */
function scanCodexRoot(root: SkillRoot): { entries: SkillEntry[]; nested: NestedSkillDir[]; errors: ScanError[] } {
  const entries: SkillEntry[] = []
  const errors: ScanError[] = []
  const tooDeep = new Map<string, string[]>()
  const seen = new Set<string>()
  let dirs = 0
  const walk = (dir: string, depth: number) => {
    let real: string
    try {
      real = realpathSync.native(dir)
    } catch (error) {
      if (!isMissing(error)) errors.push({ path: dir, reason: reasonOf(error) })
      return
    }
    if (seen.has(real) || dirs++ >= CODEX_MAX_DIRS) return
    seen.add(real)
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch (error) {
      if (!isMissing(error)) errors.push({ path: dir, reason: reasonOf(error) })
      return
    }
    for (const name of names.sort((a, b) => a.localeCompare(b))) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      const kind = entryKind(full)
      if (kind === 'file' && name === 'SKILL.md') {
        if (depth + 1 <= CODEX_SCAN_DEPTH) {
          const raw = readText(full, errors)
          if (raw === undefined) continue
          const entryName = relative(root.path, dir).replaceAll('\\', '/') || basename(dir)
          entries.push({ root, entryName, file: full, dir, kind: 'bundle', raw, parse: parseSkillText(raw, { dialect: 'codex', dirName: basename(dir) }) })
        } else {
          const top = join(root.path, relative(root.path, dir).split(/[\\/]/)[0] ?? '')
          const list = tooDeep.get(top) ?? []
          list.push(relative(top, full).replaceAll('\\', '/'))
          tooDeep.set(top, list)
        }
      } else if (kind === 'directory' && name !== 'node_modules' && depth + 1 < CODEX_SCAN_DEPTH + NESTED_SEARCH_DEPTH) {
        walk(full, depth + 1)
      }
    }
  }
  walk(root.path, 0)
  const nested = [...tooDeep].map(([dir, found]) => ({ root, dir, found: found.sort(), depthLimit: CODEX_SCAN_DEPTH }))
  return { entries, nested, errors }
}

export function buildInventory(platform: PlatformInfo): Inventory {
  const all: SkillEntry[] = []
  const nested: NestedSkillDir[] = []
  const errors: ScanError[] = []
  const seenRoots = new Set<string>()
  for (const root of mergeDuplicateRoots(platform.roots)) {
    seenRoots.add(canonical(root.path))
    const scanned = scanRoot(root)
    all.push(...scanned.entries)
    nested.push(...scanned.nested)
    errors.push(...scanned.errors)
  }

  const dropped = all.filter((e) => !e.parse.ok)
  const valid = all.filter((e): e is SkillEntry & { parse: { ok: true } } => e.parse.ok)
  // Stable order = rank, then root order, then entry order: same as dsh's compareIndexedCandidates.
  const ordered = valid
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.root.rank - b.entry.root.rank || a.index - b.index)
  // Collisions are per agent: Claude Code and Codex each load their own roots.
  const winners = new Map<string, SkillEntry>()
  const active: InstalledSkill[] = []
  const shadowed: InstalledSkill[] = []
  for (const { entry } of ordered) {
    const skill = entry.parse.skill
    const key = `${entry.root.agent ?? ''}\0${skill.name}`
    const winner = winners.get(key)
    if (winner) {
      shadowed.push({ ...entry, skill, status: 'shadowed', shadowedBy: winner })
    } else {
      winners.set(key, entry)
      active.push({ ...entry, skill, status: 'active' })
    }
  }
  active.sort((a, b) => a.skill.name.localeCompare(b.skill.name) || (a.root.agent ?? '').localeCompare(b.root.agent ?? ''))

  const activeNames = new Set(active.map((s) => s.skill.name))
  const unscanned: Inventory['unscanned'] = []
  for (const root of platform.unscannedRoots) {
    if (seenRoots.has(canonical(root.path))) continue
    const scanned = scanRoot({ path: root.path, source: root.source, rank: Number.MAX_SAFE_INTEGER })
    errors.push(...scanned.errors)
    const missing = scanned.entries.filter((e) => !e.parse.ok || !activeNames.has(e.parse.skill.name))
    if (missing.length > 0) unscanned.push({ root, entries: missing })
  }
  return { platform, active, shadowed, dropped, nested, unscanned, errors }
}

/**
 * Run from a folder without .git (your home, which is also where dsh itself starts) and
 * the "project" root is the user root: ~/.dsh/skills appears twice. Scan it once, keep the
 * winning rank (dsh lets the rank-100 copy win), but label it with the user-level source,
 * so the journal files it under the same partition no matter where you run from.
 */
export function mergeDuplicateRoots(roots: SkillRoot[]): SkillRoot[] {
  const byPath = new Map<string, SkillRoot>()
  for (const root of roots) {
    const key = `${root.agent ?? ''}\0${canonical(root.path)}`
    const prev = byPath.get(key)
    if (!prev) {
      byPath.set(key, root)
      continue
    }
    const label = prev.source.startsWith('project-') && !root.source.startsWith('project-') ? root : prev
    byPath.set(key, { ...label, rank: Math.min(prev.rank, root.rank), skipSystem: prev.skipSystem || root.skipSystem })
  }
  return [...byPath.values()]
}

function findNestedSkills(dir: string, depth: number): string[] {
  const found: string[] = []
  const walk = (current: string, level: number) => {
    if (level > depth) return
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = join(current, name)
      if (entryKind(full) !== 'directory') continue
      if (existsSync(join(full, 'SKILL.md'))) found.push(relative(dir, join(full, 'SKILL.md')).replaceAll('\\', '/'))
      else walk(full, level + 1)
    }
  }
  walk(dir, 1)
  return found.sort()
}

function entryKind(path: string): 'directory' | 'file' | undefined {
  try {
    const info = statSync(path) // follows symlinks, like dsh
    if (info.isDirectory()) return 'directory'
    if (info.isFile()) return 'file'
  } catch {
    // broken symlink or permission problem: dsh skips it too
  }
  return undefined
}

function readText(path: string, errors?: ScanError[]): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    // A missing SKILL.md is normal; an unreadable one means this skill was not checked.
    if (errors && !isMissing(error)) errors.push({ path, reason: reasonOf(error) })
    return undefined
  }
}

/** ENOENT is "this root doesn't exist", which is normal. Everything else is a failed scan. */
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function canonical(path: string): string {
  // Case folding only where the filesystem does it; on Linux `/Foo` and `/foo` are two roots.
  const fold = process.platform === 'win32' || process.platform === 'darwin' ? (s: string) => s.toLowerCase() : (s: string) => s
  try {
    return fold(realpathSync.native(path))
  } catch {
    return fold(path)
  }
}

/** Files under <dir>/scripts, relative paths. Flat skills have no resource dir of their own. */
export function listScripts(entry: Pick<SkillEntry, 'dir' | 'kind'>): string[] {
  if (entry.kind !== 'bundle') return []
  const base = join(entry.dir, 'scripts')
  const out: string[] = []
  // A symlink loop under scripts/ would otherwise recurse until the stack dies.
  const seen = new Set<string>()
  const walk = (current: string) => {
    let real: string
    try {
      real = realpathSync.native(current)
    } catch {
      return
    }
    if (seen.has(real)) return
    seen.add(real)
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      return
    }
    for (const name of names) {
      const full = join(current, name)
      const kind = entryKind(full)
      if (kind === 'directory') walk(full)
      else if (kind === 'file') out.push(relative(base, full).replaceAll('\\', '/'))
    }
  }
  walk(base)
  return out.sort()
}
