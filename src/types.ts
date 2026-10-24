import type { ParseResult, ParsedSkill } from './frontmatter.js'
import type { SessionSource } from './sessions.js'

export interface SkillRoot {
  path: string
  /** dsh source label, e.g. project-dsh, user-agents, bundled. */
  source: string
  /** Lower rank wins a name collision (dsh semantics). */
  rank: number
  skipSystem?: boolean
  /** Folder names (case-insensitive) that are not skills here, e.g. `synced`, scanned as a root of its own. */
  skipDirs?: string[]
  /** Shipped with the host; never checked against an upstream. */
  bundled?: boolean
  /** Which agent reads this root (generic mode). Name collisions only matter within one agent. */
  agent?: string
}

export interface UnscannedRoot {
  path: string
  source: string
  /** Short display form of the path for messages, e.g. ~/.claude/skills. */
  label: string
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
  /** Catalog description limit (dsh); generic mode takes it per agent from `catalogLimit`. */
  catalogMaxLength?: number
  host: HostStatus
  dshHome?: string
  profile?: string
  profileDir?: string
  /** Where this platform's agents keep session logs, for backfill. */
  sessionSources: SessionSource[]
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
  /** Set for agents that walk the tree (Codex): how many levels down they look. */
  depthLimit?: number
}

export interface ScanError {
  path: string
  reason: string
}

export interface Inventory {
  platform: PlatformInfo
  active: InstalledSkill[]
  shadowed: InstalledSkill[]
  dropped: SkillEntry[]
  nested: NestedSkillDir[]
  /** Skills sitting in directories the platform does not scan. */
  unscanned: Array<{ root: UnscannedRoot; entries: SkillEntry[] }>
  /** Roots or files we could not read (not "did not exist"): the check is incomplete there. */
  errors: ScanError[]
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
