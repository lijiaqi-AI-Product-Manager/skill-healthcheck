import { localFindings, usageFindings } from './checks.js'
import { buildInventory } from './discover.js'
import { assessImpact } from './impact.js'
import { record, Store, type JournalEvent } from './journal.js'
import { detectPlatform, type PlatformOptions } from './platforms.js'
import { checkPlugins, pluginFindings, type PluginReport } from './plugins.js'
import { catalogTimeline, loadSessions, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Finding, InstalledSkill, Inventory, PlatformInfo, Severity } from './types.js'
import { resolveProvenance, SOURCES_FILE, UpstreamChecker, type Provenance, type SourcesFile, type UpstreamResult } from './upstream.js'

export interface SkillVerdict {
  skill: InstalledSkill
  provenance: Provenance
  upstream?: UpstreamResult
  findings: Finding[]
  state: 'ok' | 'update' | 'broken' | 'unchecked'
}

export interface CheckResult {
  platform: PlatformInfo
  inventory: Inventory
  newEvents: JournalEvent[]
  verdicts: SkillVerdict[]
  /** Findings about things that aren't an active skill (dropped, nested, unscanned roots...). */
  orphanFindings: Finding[]
  plugins?: PluginReport
  pluginFindings: Finding[]
  sessions: SessionSummary[]
  timeline: CatalogTimeline
}

export interface CheckOptions extends PlatformOptions {
  offline?: boolean
  sessions?: boolean
  store?: Store
  /** Status text while network checks run (the CLI shows it on stderr). */
  onProgress?: (text: string) => void
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
export const severityRank = (s: Severity) => SEVERITY_ORDER.indexOf(s)

/** Scan + record. Every command calls this first so the journal never has gaps we could have filled. */
export function scanAndRecord(options: CheckOptions = {}) {
  const store = options.store ?? new Store()
  const platform = detectPlatform(options)
  const inventory = buildInventory(platform)
  const newEvents = record(inventory, store)
  return { store, platform, inventory, newEvents }
}

export async function runCheck(options: CheckOptions = {}): Promise<CheckResult> {
  const { store, platform, inventory, newEvents } = scanAndRecord(options)
  const sessions = options.sessions === false ? [] : loadSessions(platform.sessionsDir, store)
  const timeline = catalogTimeline(sessions)
  const local = localFindings(inventory)
  const usage = usageFindings(inventory, sessions, timeline)
  const sources = store.readJsonFile<SourcesFile>(SOURCES_FILE) ?? {}
  const fetched = new Set<string>()
  const checker = new UpstreamChecker(store, {
    offline: options.offline,
    onFetch: (url) => {
      fetched.add(url)
      options.onProgress?.(`正在检查上游（第 ${fetched.size} 个仓库）：${url}`)
    },
  })

  const verdicts = await mapLimit(inventory.active, 4, async (skill): Promise<SkillVerdict> => {
    const provenance = await resolveProvenance(skill, platform, sources)
    const findings = [...local, ...usage].filter((f) => f.subject === skill.skill.name && f.code !== 'shadowed' && f.code !== 'dropped')
    let upstream: UpstreamResult | undefined
    if (provenance.kind === 'git') {
      upstream = await checker.check(skill, provenance)
      findings.push(...upstreamFindings(skill, upstream, platform))
    }
    return { skill, provenance, upstream, findings, state: verdictState(provenance, upstream, findings) }
  })

  const activeNames = new Set(inventory.active.map((s) => s.skill.name))
  const orphanFindings = local.filter((f) => f.code === 'dropped' || f.code === 'shadowed' || f.code === 'nested' || f.code === 'unscanned-root' || !activeNames.has(f.subject))
  if (!options.offline && platform.id === 'dsh') options.onProgress?.('正在检查插件版本…')
  const plugins = await checkPlugins(platform, { offline: options.offline })
  options.onProgress?.('')
  return { platform, inventory, newEvents, verdicts, orphanFindings, plugins, pluginFindings: pluginFindings(plugins), sessions, timeline }
}

function upstreamFindings(skill: InstalledSkill, upstream: UpstreamResult, platform: PlatformInfo): Finding[] {
  const name = skill.skill.name
  switch (upstream.state) {
    case 'current':
      return []
    case 'unreachable':
      return [{ code: 'upstream-unreachable', severity: 'info', subject: name, message: `上游暂时无法检查：${upstream.detail}`, area: 'upstream' }]
    case 'repo-missing':
      return [{ code: 'repo-missing', severity: 'critical', subject: name, message: `上游仓库已不存在（${upstream.detail}），本地副本已无人维护`, area: 'upstream' }]
    case 'repo-moved':
      return [{ code: 'repo-moved', severity: 'medium', subject: name, message: `上游仓库已迁移到 ${upstream.newUrl}`, detail: ['用 skill-healthcheck adopt 更新来源'], area: 'upstream' }]
    case 'removed-in-repo':
      return [
        {
          code: 'removed-upstream',
          severity: 'critical',
          subject: name,
          message: `上游已删除这个技能${upstream.date ? `（${upstream.date.slice(0, 10)}）` : ''}，本地副本已无人维护`,
          detail: [`删除提交：${upstream.commit.slice(0, 10)}`],
          area: 'upstream',
        },
      ]
    case 'changed': {
      const impact = assessImpact({
        name,
        before: skill.skill,
        after: upstream.parse,
        scripts: upstream.scripts,
        catalogMaxLength: platform.catalogMaxLength,
        movedTo: upstream.movedTo,
      })
      if (impact.length === 0) {
        impact.push({ code: 'upstream-minor', severity: 'low', subject: name, message: '上游有小改动（不影响触发）', area: 'upstream' })
      }
      const when = upstream.date ? `上游 ${upstream.date.slice(0, 10)} 更新` : '上游有更新'
      for (const f of impact) f.detail = [when + (upstream.localModified ? '；你本地也改过这个文件' : ''), ...(f.detail ?? [])]
      return impact
    }
  }
}

function verdictState(prov: Provenance, upstream: UpstreamResult | undefined, findings: Finding[]): SkillVerdict['state'] {
  if (findings.some((f) => f.severity === 'critical' && f.area !== 'upstream')) return 'broken'
  if (upstream?.state === 'repo-missing' || upstream?.state === 'removed-in-repo') return 'broken'
  if (upstream?.state === 'changed') return 'update'
  if (findings.some((f) => f.severity === 'high')) return 'broken'
  if (prov.kind === 'unknown' || upstream?.state === 'unreachable') return 'unchecked'
  return 'ok'
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}
