// Plugin health for dsh profiles. Plugins are npm packages with semver and rollback, so
// the tool may say "one-click upgradable"; it still never upgrades anything itself.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import semver from 'semver'
import type { Finding, PlatformInfo } from './types.js'

export interface PluginInfo {
  name: string
  spec: string
  version?: string
  official: boolean
  state: 'ok' | 'upgradable' | 'broken' | 'unknown'
  latest?: string
  reason?: string
  exempted?: boolean
}

export interface PluginReport {
  bundles: string[]
  plugins: PluginInfo[]
  checkedRegistry: boolean
}

const DSH_SCOPE = '@deepseek-ai/'

/** `npm view <spec> --json`, injectable for tests. */
export type RegistryView = (spec: string, cwd: string) => Promise<any | undefined>

export async function checkPlugins(platform: PlatformInfo, options: { offline?: boolean; view?: RegistryView } = {}): Promise<PluginReport | undefined> {
  if (platform.id !== 'dsh' || !platform.profileDir) return undefined
  const pkg = readJson(join(platform.profileDir, 'package.json'))
  if (!pkg) return undefined
  const bundles: string[] = Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : []
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}) }
  const exemptions = readJson(join(platform.profileDir, 'compatibility.json')) ?? {}
  const host = platform.host.version
  const plugins: PluginInfo[] = []
  for (const [name, spec] of Object.entries(deps)) {
    const installed = readJson(join(platform.profileDir, 'node_modules', ...name.split('/'), 'package.json'))
    const info: PluginInfo = { name, spec, official: name.startsWith(DSH_SCOPE), state: 'ok', version: installed?.version }
    if (!installed) {
      info.state = 'broken'
      info.reason = '已声明但 node_modules 里没有，宿主会拒绝加载'
    } else if (host) {
      const unmet = unmetHostRequirements(installed, host)
      const exempt = isExempt(exemptions, name, installed.version, host)
      if (unmet.length && !exempt) {
        info.state = 'broken'
        info.reason = `要求 ${unmet.join('、')}，当前 dsh ${host}`
      } else if (unmet.length && exempt) {
        info.exempted = true
        info.reason = `与 dsh ${host} 不兼容，靠版本豁免运行`
      }
    }
    plugins.push(info)
  }
  const checkedRegistry = !options.offline && plugins.length > 0
  if (checkedRegistry) {
    const view = options.view ?? npmView
    await Promise.all(plugins.map((p) => (p.version ? registryCheck(p, host, platform.profileDir!, view) : Promise.resolve())))
  }
  return { bundles, plugins, checkedRegistry }
}

function unmetHostRequirements(pkg: any, host: string): string[] {
  const unmet: string[] = []
  const coerced = semver.coerce(host, { includePrerelease: true })?.version ?? host
  const satisfied = (range: string) => semver.satisfies(host, range, { includePrerelease: true }) || semver.satisfies(coerced, range, { includePrerelease: true })
  const engine = pkg.engines?.dsh
  if (typeof engine === 'string' && !satisfied(engine)) unmet.push(`engines.dsh ${engine}`)
  for (const [dep, range] of Object.entries<string>(pkg.peerDependencies ?? {})) {
    // dsh packages are released in lockstep with the host, so a dsh peer range is a host range.
    if (dep.startsWith(DSH_SCOPE) && dep !== '@deepseek-ai/cordis' && !dep.endsWith('schemastery') && !dep.endsWith('cosmokit') && !satisfied(range)) {
      unmet.push(`${dep} ${range}`)
    }
  }
  return unmet
}

function isExempt(exemptions: any, name: string, version: string, host: string): boolean {
  const entry = exemptions?.[`${name}@${version}`] ?? exemptions?.exemptions?.[`${name}@${version}`]
  return Array.isArray(entry) && entry.includes(host)
}

async function registryCheck(p: PluginInfo, host: string | undefined, cwd: string, npmViewFn: RegistryView) {
  const view = await npmViewFn(p.name, cwd)
  if (!view) {
    if (p.state === 'ok') p.state = 'unknown'
    return
  }
  if (view.deprecated) {
    p.state = 'broken'
    p.reason = `已被作者弃用：${String(view.deprecated).slice(0, 60)}`
    return
  }
  const latest: string | undefined = view['dist-tags']?.latest ?? view.version
  if (!latest || !p.version || !semver.valid(latest) || !semver.gt(latest, p.version)) {
    if (p.state === 'ok' && view.time?.modified && Date.now() - Date.parse(view.time.modified) > 365 * 86_400_000 && p.exempted) {
      p.state = 'broken'
      p.reason = '超过一年没有发布新版本，且与当前 dsh 不兼容'
    }
    return
  }
  p.latest = latest
  // `npm view <name>` describes the latest version's manifest already, but be explicit.
  const latestMeta = view.version === latest ? view : await npmViewFn(`${p.name}@${latest}`, cwd)
  const unmet = host && latestMeta ? unmetHostRequirements(latestMeta, host) : []
  if (unmet.length) {
    p.reason = `${latest} 也不兼容当前 dsh（${unmet[0]}）`
    if (p.state === 'ok') p.state = 'unknown'
    return
  }
  if (p.state === 'ok' || p.exempted) p.state = 'upgradable'
}

const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

/** `npm` is a .cmd on Windows and needs a shell, so only ever pass it validated specs. */
export function isSafeNpmSpec(spec: string): boolean {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return NPM_NAME.test(spec)
  return NPM_NAME.test(spec.slice(0, at)) && semver.valid(spec.slice(at + 1)) !== null
}

function npmView(name: string, cwd: string): Promise<any | undefined> {
  if (!isSafeNpmSpec(name)) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['view', name, '--json'],
      { cwd, timeout: 20_000, windowsHide: true, shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve(undefined)
        try {
          resolve(JSON.parse(String(stdout)))
        } catch {
          resolve(undefined)
        }
      },
    )
  })
}

export function pluginFindings(report: PluginReport | undefined): Finding[] {
  if (!report) return []
  return report.plugins
    .filter((p) => p.state === 'broken' || p.exempted)
    .map((p) => ({
      code: p.state === 'broken' ? 'plugin-broken' : 'plugin-exempted',
      severity: p.state === 'broken' ? ('critical' as const) : ('medium' as const),
      subject: p.name,
      message: p.reason ?? '失效',
      area: 'plugin' as const,
    }))
}

function readJson(file: string): any | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return undefined
  }
}
