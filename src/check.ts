import { catalogText, localFindings, usageFindings } from './checks.js'
import { buildInventory } from './discover.js'
import type { ParseResult, ParsedSkill } from './frontmatter.js'
import { t } from './i18n.js'
import { Explainer, resolveProvider, type Provider } from './explain.js'
import { assessImpact, wordDiff } from './impact.js'
import { record, Store, type JournalEvent } from './journal.js'
import { catalogLimit, detectPlatform, type PlatformOptions } from './platforms.js'
import { checkPlugins, pluginFindings, type PluginReport } from './plugins.js'
import { catalogTimeline, loadSessions, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Finding, InstalledSkill, Inventory, PlatformInfo, Severity } from './types.js'
import { resolveProvenance, SOURCES_FILE, UpstreamChecker, type Provenance, type ProvenanceCache, type SourcesFile, type UpstreamResult } from './upstream.js'

export interface SkillVerdict {
  skill: InstalledSkill
  provenance: Provenance
  upstream?: UpstreamResult
  findings: Finding[]
  state: 'ok' | 'update' | 'broken' | 'unchecked'
  /** --explain: one plain sentence from an LLM about the upstream change. */
  explanation?: string
}

export type ExplainStatus = { used: true; provider: string; model: string } | { used: false }

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
  /** Present when the journal could not be written (read-only home); the check still ran. */
  journalError?: string
  /** Present when --explain was asked for. */
  explain?: ExplainStatus
}

export interface CheckOptions extends PlatformOptions {
  offline?: boolean
  sessions?: boolean
  store?: Store
  /** true: use the provider from the environment; a Provider: use that one (tests, the dsh plugin). */
  explain?: boolean | Provider
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
  const sessions = options.sessions === false ? [] : loadSessions(platform.sessionSources, store)
  const timeline = catalogTimeline(sessions)
  const local = localFindings(inventory)
  const usage = usageFindings(inventory, sessions, timeline)
  const sources = store.readJsonFile<SourcesFile>(SOURCES_FILE) ?? {}
  // Group once instead of scanning every finding for every skill (O(skills x findings)).
  const grouped = new Map<string, Finding[]>()
  for (const finding of [...local, ...usage]) {
    // `shadowed` and `dropped` describe other entries that share a name; they belong to
    // orphanFindings, never to an active skill's own verdict.
    if (finding.code === 'shadowed' || finding.code === 'dropped') continue
    const list = grouped.get(finding.subject)
    if (list) list.push(finding)
    else grouped.set(finding.subject, [finding])
  }
  // One git spawn per checkout, not per skill: every skill in the same repo shares a root.
  const repoCache: ProvenanceCache = new Map()
  const provenanceOf = (skill: InstalledSkill) => resolveProvenance(skill, platform, sources, repoCache)
  const fetched = new Set<string>()
  const checker = new UpstreamChecker(store, {
    offline: options.offline,
    onFetch: (url) => {
      fetched.add(url)
      options.onProgress?.(t('progress.upstream', fetched.size, url))
    },
  })

  const verdicts = await mapLimit(inventory.active, 4, async (skill): Promise<SkillVerdict> => {
    const provenance = await provenanceOf(skill)
    const findings = [...(grouped.get(skill.skill.name) ?? [])]
    let upstream: UpstreamResult | undefined
    if (provenance.kind === 'git') {
      upstream = await checker.check(skill, provenance)
      findings.push(...upstreamFindings(skill, upstream, platform))
    }
    return { skill, provenance, upstream, findings, state: verdictState(provenance, upstream, findings) }
  })

  const activeNames = new Set(inventory.active.map((s) => s.skill.name))
  const orphanFindings = local.filter((f) => f.code === 'dropped' || f.code === 'shadowed' || f.code === 'nested' || f.code === 'unscanned-root' || !activeNames.has(f.subject))
  if (!options.offline && platform.id === 'dsh') options.onProgress?.(t('progress.plugins'))
  const plugins = await checkPlugins(platform, { offline: options.offline })
  const explain = options.explain && !options.offline ? await explainVerdicts(verdicts, options, store) : undefined
  options.onProgress?.('')
  return {
    platform,
    inventory,
    newEvents,
    verdicts,
    orphanFindings,
    plugins,
    pluginFindings: pluginFindings(plugins),
    sessions,
    timeline,
    ...(store.writeError ? { journalError: store.writeError } : {}),
    explain,
  }
}

/** Finding codes worth a plain-language sentence: the ones that change whether or how a skill runs. */
const EXPLAINED = new Set(['description-changed', 'name-changed', 'upstream-invalid', 'model-invocation-disabled', 'user-invocation-disabled', 'scripts-added'])

async function explainVerdicts(verdicts: SkillVerdict[], options: CheckOptions, store: Store): Promise<ExplainStatus> {
  const provider = typeof options.explain === 'object' ? options.explain : resolveProvider()
  if (!provider) return { used: false }
  const explainer = new Explainer(provider, store)
  const todo = verdicts.filter((v) => v.upstream?.state === 'changed' && v.findings.some((f) => EXPLAINED.has(f.code)))
  let done = 0
  await mapLimit(todo, 3, async (v) => {
    const up = v.upstream as Extract<UpstreamResult, { state: 'changed' }>
    const after = up.parse.ok ? up.parse.skill : undefined
    const { removed, added } = after ? wordDiff(v.skill.skill.description, after.description) : { removed: [], added: [] }
    options.onProgress?.(t('progress.explain', ++done))
    v.explanation = await explainer.explain({
      skill: v.skill.skill.name,
      codes: v.findings.filter((f) => f.area === 'upstream').map((f) => f.code),
      before: { name: v.skill.skill.name, description: v.skill.skill.description },
      after: { name: after?.name ?? v.skill.skill.name, description: after?.description ?? '' },
      removedWords: removed,
      addedWords: added,
      scriptsAdded: up.scripts.added,
    })
  })
  explainer.save()
  return { used: true, provider: provider.id, model: provider.model }
}

function upstreamFindings(skill: InstalledSkill, upstream: UpstreamResult, platform: PlatformInfo): Finding[] {
  const name = skill.skill.name
  switch (upstream.state) {
    case 'current':
      return []
    case 'unreachable':
      return [{ code: 'upstream-unreachable', severity: 'info', subject: name, message: t('up.unreachable', upstream.detail), area: 'upstream' }]
    case 'repo-missing':
      return [{ code: 'repo-missing', severity: 'critical', subject: name, message: t('up.repoMissing', upstream.detail), area: 'upstream' }]
    case 'repo-moved':
      return [{ code: 'repo-moved', severity: 'medium', subject: name, message: t('up.repoMoved', upstream.newUrl), detail: [t('up.adoptHint')], area: 'upstream' }]
    case 'removed-in-repo':
      return [
        {
          code: 'removed-upstream',
          severity: 'critical',
          subject: name,
          message: t('up.removed', upstream.date?.slice(0, 10)),
          detail: [t('up.deletedIn', upstream.commit.slice(0, 10))],
          area: 'upstream',
        },
      ]
    case 'changed': {
      // Compare what the model is shown: Claude Code lists when_to_use after the description.
      const agent = skill.root.agent
      const listed = (s: ParsedSkill): ParsedSkill => ({ ...s, description: catalogText(s, agent) })
      const after: ParseResult = upstream.parse.ok ? { ok: true, skill: listed(upstream.parse.skill) } : upstream.parse
      const impact = assessImpact({
        name,
        before: listed(skill.skill),
        after,
        scripts: upstream.scripts,
        catalogMaxLength: catalogLimit(platform, agent),
        movedTo: upstream.movedTo,
      })
      if (impact.length === 0) {
        impact.push({ code: 'upstream-minor', severity: 'low', subject: name, message: t('up.minor'), area: 'upstream' })
      }
      const when = upstream.date ? t('up.updatedOn', upstream.date.slice(0, 10)) : t('up.updated')
      for (const f of impact) f.detail = [when + (upstream.localModified ? t('up.localModified') : ''), ...(f.detail ?? [])]
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
