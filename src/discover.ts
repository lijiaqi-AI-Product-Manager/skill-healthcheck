import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSkillText } from './frontmatter.js'
import type { InstalledSkill, Inventory, NestedSkillDir, PlatformInfo, SkillEntry, SkillRoot } from './types.js'

const NESTED_SEARCH_DEPTH = 3

/** List a root's top-level entries the way dsh-skill-filesystem does (depth 1, sorted). */
export function scanRoot(root: SkillRoot): { entries: SkillEntry[]; nested: NestedSkillDir[] } {
  const entries: SkillEntry[] = []
  const nested: NestedSkillDir[] = []
  let names: string[]
  try {
    names = readdirSync(root.path)
  } catch {
    return { entries, nested }
  }
  for (const name of names.sort((a, b) => a.localeCompare(b))) {
    if (root.skipSystem && name === '.system') continue
    const full = join(root.path, name)
    const kind = entryKind(full)
    if (kind === 'directory') {
      const file = join(full, 'SKILL.md')
      const raw = readText(file)
      if (raw === undefined) {
        if (!name.startsWith('.')) {
          const found = findNestedSkills(full, NESTED_SEARCH_DEPTH)
          if (found.length > 0) nested.push({ root, dir: full, found })
        }
        continue
      }
      entries.push({ root, entryName: name, file, dir: full, kind: 'bundle', raw, parse: parseSkillText(raw) })
    } else if (kind === 'file' && name.endsWith('.md')) {
      const raw = readText(full)
      if (raw === undefined) continue
      entries.push({ root, entryName: name, file: full, dir: root.path, kind: 'flat', raw, parse: parseSkillText(raw) })
    }
  }
  return { entries, nested }
}

export function buildInventory(platform: PlatformInfo): Inventory {
  const all: SkillEntry[] = []
  const nested: NestedSkillDir[] = []
  const seenRoots = new Set<string>()
  for (const root of mergeDuplicateRoots(platform.roots)) {
    seenRoots.add(canonical(root.path))
    const scanned = scanRoot(root)
    all.push(...scanned.entries)
    nested.push(...scanned.nested)
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
    const { entries } = scanRoot({ path: root.path, source: root.source, rank: Number.MAX_SAFE_INTEGER })
    const missing = entries.filter((e) => !e.parse.ok || !activeNames.has(e.parse.skill.name))
    if (missing.length > 0) unscanned.push({ root, entries: missing })
  }
  return { platform, active, shadowed, dropped, nested, unscanned }
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

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
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
