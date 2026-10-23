import type { ParseResult, ParsedSkill } from './frontmatter.js'

export interface SkillRoot {
  path: string
  /** dsh source label, e.g. project-dsh, user-agents, bundled. */
  source: string
  /** Lower rank wins a name collision (dsh semantics). */
  rank: number
  skipSystem?: boolean
  /** Shipped with the host; never checked against an upstream. */
  bundled?: boolean
}

export interface UnscannedRoot {
  path: string
  source: string
  why: string
}

export interface HostStatus {
  name: string
  version?: string
  ok: boolean
  detail?: string
}

export interface PlatformInfo {
  id: 'dsh' | 'generic'
  label: string
  cwd: string
  projectRoot: string
  roots: SkillRoot[]
  unscannedRoots: UnscannedRoot[]
  /** Catalog description limit; undefined when the platform doesn't truncate (or we don't know). */
  catalogMaxLength?: number
  host: HostStatus
  dshHome?: string
  profile?: string
  profileDir?: string
  sessionsDir?: string
}

export interface SkillEntry {
  root: SkillRoot
  entryName: string
  /** The instruction file: <dir>/SKILL.md or a flat <name>.md. */
  file: string
  /** Resource base directory (where scripts/ lives). */
  dir: string
  kind: 'bundle' | 'flat'
  raw: string
  parse: ParseResult
}

export interface InstalledSkill extends SkillEntry {
  skill: ParsedSkill
  status: 'active' | 'shadowed'
  /** For shadowed skills: the entry that wins the name. */
  shadowedBy?: SkillEntry
}

export interface NestedSkillDir {
  root: SkillRoot
  dir: string
  /** SKILL.md files found below the top level that dsh will never discover. */
  found: string[]
}

export interface Inventory {
  platform: PlatformInfo
  active: InstalledSkill[]
  shadowed: InstalledSkill[]
  dropped: SkillEntry[]
  nested: NestedSkillDir[]
  /** Skills sitting in directories the platform does not scan. */
  unscanned: Array<{ root: UnscannedRoot; entries: SkillEntry[] }>
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface Finding {
  code: string
  severity: Severity
  /** Skill name (or plugin name) the finding is about. */
  subject: string
  /** One short line, Chinese, shown in the report. */
  message: string
  detail?: string[]
  /** Which section: local (on disk), upstream, usage (session evidence), plugin. */
  area: 'local' | 'upstream' | 'usage' | 'plugin'
}
