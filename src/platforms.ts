import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'yaml'
import { agentsHome, dshHome, userHome } from './env.js'
import { t } from './i18n.js'
import type { HostStatus, PlatformInfo, SkillRoot, UnscannedRoot } from './types.js'

export type PlatformId = 'dsh' | 'generic'

export interface PlatformOptions {
  cwd?: string
  platform?: PlatformId
  profile?: string
}

/** dsh's project root: nearest ancestor containing .git, else cwd. */
export function findProjectRoot(cwd: string): string {
  let current = resolve(cwd)
  while (true) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(cwd)
    current = parent
  }
}

export function detectPlatform(options: PlatformOptions = {}): PlatformInfo {
  const cwd = resolve(options.cwd ?? process.cwd())
  const id = options.platform ?? (isDir(join(dshHome(), 'profiles')) ? 'dsh' : 'generic')
  return id === 'dsh' ? dshPlatform(cwd, options.profile) : genericPlatform(cwd)
}

// Ranks and sources copied from @deepseek-ai/dsh-skill-filesystem 0.2.x.
const PROJECT_DSH_RANK = 100
const PROJECT_AGENTS_RANK = 200
const CUSTOM_RANK = 300
const USER_DSH_RANK = 400
const USER_AGENTS_RANK = 500
const BUNDLED_RANK = 600
const DSH_CATALOG_DESCRIPTION_MAX = 500

function dshPlatform(cwd: string, profileOption?: string): PlatformInfo {
  const home = dshHome()
  const projectRoot = findProjectRoot(cwd)
  const profile = profileOption ?? pickProfile(home)
  const profileDir = profile ? join(home, 'profiles', profile) : undefined
  const roots: SkillRoot[] = [
    { path: join(projectRoot, '.dsh', 'skills'), source: 'project-dsh', rank: PROJECT_DSH_RANK },
    { path: join(projectRoot, '.agents', 'skills'), source: 'project-agents', rank: PROJECT_AGENTS_RANK },
    ...customSkillDirs(profileDir).map((path) => ({ path, source: 'custom', rank: CUSTOM_RANK })),
    { path: join(home, 'skills'), source: 'user-dsh', rank: USER_DSH_RANK, skipSystem: true },
    { path: join(agentsHome(), 'skills'), source: 'user-agents', rank: USER_AGENTS_RANK },
  ]
  const bundled = bundledSkillDir()
  if (bundled) roots.push({ path: bundled, source: 'bundled', rank: BUNDLED_RANK, bundled: true })

  const unscannedRoots: UnscannedRoot[] = [
    { path: join(userHome(), '.claude', 'skills'), source: 'claude-user', label: '~/.claude/skills' },
    { path: join(projectRoot, '.claude', 'skills'), source: 'claude-project', label: '.claude/skills' },
    { path: join(userHome(), '.codex', 'skills'), source: 'codex-user', label: '~/.codex/skills' },
  ]
  return {
    id: 'dsh',
    label: 'DeepSeek Harness',
    cwd,
    projectRoot,
    roots,
    unscannedRoots,
    catalogMaxLength: DSH_CATALOG_DESCRIPTION_MAX,
    host: dshHostStatus(home, profileDir),
    dshHome: home,
    profile,
    profileDir,
    sessionSources: [{ dir: join(home, 'sessions'), format: 'dsh' }],
  }
}

function genericPlatform(cwd: string): PlatformInfo {
  const projectRoot = findProjectRoot(cwd)
  const home = userHome()
  const codexHome = process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(home, '.codex')
  // Each agent reads its own roots, so a skill installed for both is not a conflict.
  // Claude Code: project .claude/skills, ~/.claude/skills.
  // Codex (codex-rs ext/skills host_roots.rs): project .codex/skills and .agents/skills,
  // ~/.agents/skills, $CODEX_HOME/skills (its .system folder is Codex's own cache).
  const roots: SkillRoot[] = [
    { path: join(projectRoot, '.claude', 'skills'), source: 'project-claude', rank: 100, agent: 'claude-code' },
    { path: join(home, '.claude', 'skills'), source: 'user-claude', rank: 400, agent: 'claude-code' },
    { path: join(projectRoot, '.codex', 'skills'), source: 'project-codex', rank: 100, agent: 'codex' },
    { path: join(projectRoot, '.agents', 'skills'), source: 'project-agents', rank: 110, agent: 'codex' },
    { path: join(agentsHome(), 'skills'), source: 'user-agents', rank: 400, agent: 'codex' },
    { path: join(codexHome, 'skills'), source: 'user-codex', rank: 410, agent: 'codex', skipSystem: true },
  ]
  return {
    id: 'generic',
    label: t('r.genericLabel'),
    cwd,
    projectRoot,
    roots,
    unscannedRoots: [],
    host: { name: t('r.hostGeneric'), ok: true, detail: t('r.hostGenericDetail') },
    sessionSources: [
      { dir: join(home, '.claude', 'projects'), format: 'claude-code' },
      { dir: join(process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(home, '.codex'), 'sessions'), format: 'codex' },
    ],
  }
}

function pickProfile(home: string): string | undefined {
  const dir = join(home, 'profiles')
  if (!isDir(dir)) return undefined
  const names = readdirSync(dir).filter((name) => isDir(join(dir, name)))
  if (names.includes('desktop')) return 'desktop'
  return names.sort()[0]
}

function customSkillDirs(profileDir: string | undefined): string[] {
  if (!profileDir) return []
  const file = join(profileDir, 'cordis.patch.yml')
  if (!existsSync(file)) return []
  try {
    const entries: unknown = parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(entries)) return []
    const dirs: string[] = []
    for (const entry of entries) {
      if (entry?.name !== '@deepseek-ai/dsh-skill-filesystem') continue
      const list = entry?.config?.customSkillDirs
      if (Array.isArray(list)) dirs.push(...list.filter((d: unknown): d is string => typeof d === 'string').map((d) => resolve(profileDir, d)))
    }
    return dirs
  } catch {
    return []
  }
}

function bundledSkillDir(): string | undefined {
  if (process.env.DSH_BUNDLED_SKILL_DIR) return resolve(process.env.DSH_BUNDLED_SKILL_DIR)
  if (process.env.SKILL_HEALTHCHECK_USER_HOME) return undefined // sandboxed run: don't reach into the real install
  for (const install of dshInstallDirs()) {
    const dir = join(install, 'runtime', 'office-skills')
    if (isDir(dir)) return dir
  }
  return undefined
}

function dshInstallDirs(): string[] {
  const dirs: string[] = []
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    dirs.push(join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources'))
  } else if (process.platform === 'darwin') {
    dirs.push('/Applications/DeepSeek Harness.app/Contents/Resources', join(userHome(), 'Applications', 'DeepSeek Harness.app', 'Contents', 'Resources'))
  } else {
    dirs.push('/opt/DeepSeek Harness/resources', '/usr/lib/deepseek-harness/resources')
  }
  return dirs
}

function dshHostStatus(home: string, profileDir: string | undefined): HostStatus {
  const version = readRuntimeVersion(home)
  if (!profileDir || !isDir(profileDir)) {
    return { name: 'dsh', version, ok: false, detail: t('host.noProfile') }
  }
  const pkgFile = join(profileDir, 'package.json')
  try {
    JSON.parse(readFileSync(pkgFile, 'utf8'))
  } catch {
    return { name: 'dsh', version, ok: false, detail: t('host.badPackage', pkgFile) }
  }
  if (!version) return { name: 'dsh', ok: false, detail: t('host.noVersion') }
  return { name: 'dsh', version, ok: true }
}

export function readRuntimeVersion(home: string): string | undefined {
  const candidates: string[] = []
  const runtimes = join(home, 'dsh-runtimes')
  if (isDir(runtimes)) {
    for (const name of readdirSync(runtimes)) candidates.push(join(runtimes, name, 'runtime.json'))
  }
  if (!process.env.SKILL_HEALTHCHECK_USER_HOME) {
    for (const install of dshInstallDirs()) candidates.push(join(install, 'runtime', 'primary-runtime', 'runtime.json'))
  }
  for (const file of candidates) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof data.desktopVersion === 'string') return data.desktopVersion
      if (typeof data.version === 'string') return data.version
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
