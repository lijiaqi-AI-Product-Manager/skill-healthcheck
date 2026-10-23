import { severityRank, type CheckResult, type SkillVerdict } from './check.js'
import { t, type MessageKey } from './i18n.js'
import type { JournalEvent } from './journal.js'
import { symptomTitle } from './lexicon.js'
import { localDay } from './sessions.js'
import type { Finding, Inventory } from './types.js'
import type { WhyResult } from './why.js'

let useColor = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

/** Hosts that render plain text (the dsh plugin) turn colors off. */
export function setColor(on: boolean) {
  useColor = on
}

const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
export const c = { red: paint('31'), yellow: paint('33'), green: paint('32'), cyan: paint('36'), dim: paint('2'), bold: paint('1') }

const LINE_BUDGET = 15
const INDENT = '      '

interface Item {
  rank: number
  line: string
  evidence?: string
  /** A second line under the item (the --explain sentence). */
  extra?: string
}

/** Terminal columns: CJK and full-width characters take two. */
export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s.replace(/\x1b\[[0-9;]*m/g, '')) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  return w
}

export function padDisplay(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - displayWidth(s)))
}

export function renderCheck(r: CheckResult, options: { all?: boolean } = {}): string {
  const lines: string[] = []
  const now = new Date()
  const profile = r.platform.profile ? t('r.profile', r.platform.profile) : ''
  lines.push(c.bold(t('r.header', r.platform.label, profile, `${localDay(now.getTime())} ${now.toTimeString().slice(0, 5)}`)))

  const labelWidth = Math.max(...(['r.host', 'r.plugins', 'r.skills'] as const).map((k) => displayWidth(t(k)))) + 2
  const label = (key: MessageKey & ('r.host' | 'r.plugins' | 'r.skills')) => padDisplay(t(key), labelWidth)

  const host = r.platform.host
  lines.push(`${label('r.host')}${host.name}${host.version ? ` ${host.version}` : ''} ${host.ok ? c.green('✓') : c.red('✗')}${host.detail ? c.dim(`  ${host.detail}`) : ''}`)

  const items: Item[] = []
  let upgradable = 0
  if (r.plugins) {
    const ps = r.plugins.plugins
    const broken = ps.filter((p) => p.state === 'broken').length
    upgradable = ps.filter((p) => p.state === 'upgradable').length
    const ok = ps.length - broken - upgradable
    const tail = r.plugins.checkedRegistry || ps.length === 0 ? '' : c.dim(t('r.offlinePlugins'))
    const bundles = r.plugins.bundles.length ? c.dim(t('r.bundles', r.plugins.bundles.length)) : ''
    lines.push(`${label('r.plugins')}${t('r.pluginCounts', ps.length, ok, colorCount(upgradable, c.cyan), colorCount(broken, c.red))}${tail}${bundles}`)
    for (const f of r.pluginFindings) items.push({ rank: severityRank(f.severity), line: itemLine(f.severity === 'critical' ? c.red('✗') : c.yellow('!'), f.subject, f.message) })
    for (const p of ps.filter((p) => p.state === 'upgradable')) items.push({ rank: 3, line: itemLine(c.cyan('↑'), p.name, `${p.version} → ${p.latest}`) })
  } else if (r.platform.id === 'dsh') {
    lines.push(`${label('r.plugins')}${c.dim(t('r.noProfile'))}`)
  }

  const counts = { ok: 0, update: 0, broken: 0, unchecked: 0 }
  for (const v of r.verdicts) counts[v.state]++
  // One problem to fix = one count: a folder with 15 nested skills is one move, not 15 reviews.
  // The finding's message carries how many skills are inside.
  const extraCount = r.orphanFindings.filter((f) => f.severity === 'critical' || f.severity === 'high').length
  counts.broken += extraCount
  const total = r.verdicts.length + extraCount
  const bundled = r.verdicts.filter((v) => v.provenance.kind === 'bundled').length
  lines.push(
    label('r.skills') +
      t('r.skillCounts', total, counts.ok, colorCount(counts.update, c.cyan), colorCount(counts.broken, c.red)) +
      (counts.unchecked ? c.dim(t('r.unchecked', counts.unchecked)) : '') +
      (bundled ? c.dim(t('r.bundled', bundled)) : ''),
  )
  for (const v of r.verdicts) {
    const worst = worstFinding(v)
    if (!worst || worst.severity === 'info' || (worst.severity === 'low' && !options.all)) continue
    const symbol = v.state === 'update' ? c.cyan('↑') : worst.severity === 'critical' || v.state === 'broken' ? c.red('✗') : c.yellow('!')
    const tag = v.state === 'update' && worst.severity === 'critical' ? c.red(t('r.critical')) : v.state === 'update' && worst.severity === 'high' ? c.yellow(t('r.high')) : ''
    const evidence = v.findings.find((f) => f.area === 'usage')
    items.push({
      rank: severityRank(worst.severity) - (v.state === 'broken' ? 0.5 : 0),
      line: itemLine(symbol, v.skill.skill.name, worst.message) + tag,
      evidence: evidence ? t('r.evidence', v.skill.skill.name, evidence.message) : undefined,
      extra: v.explanation ? c.dim(`${INDENT}  ${t('explain.line', v.explanation)}`) : undefined,
    })
  }
  for (const f of r.orphanFindings) {
    if (f.severity === 'info' || (f.severity === 'low' && !options.all)) continue
    items.push({ rank: severityRank(f.severity), line: itemLine(f.severity === 'critical' ? c.red('✗') : c.yellow('!'), shortSubject(f.subject), f.message) })
  }

  const unknown = r.verdicts.filter((v) => v.provenance.kind === 'unknown').length
  const footer: string[] = []
  if (unknown) footer.push(c.dim(t('r.unknownSources', unknown)))
  if (r.explain) footer.push(c.dim(r.explain.used ? t('explain.via', r.explain.provider, r.explain.model) : t('explain.none')))
  footer.push(conclusion(upgradable, counts.update + counts.broken))

  items.sort((a, b) => a.rank - b.rank)
  const evidence = items.find((i) => i.evidence)?.evidence
  const height = (i: Item) => (i.extra ? 2 : 1)
  const itemLines = items.reduce((n, i) => n + height(i), 0)
  const room = options.all ? itemLines : Math.max(2, LINE_BUDGET - lines.length - footer.length - (evidence ? 1 : 0))
  // Keep one line for "...N more" when everything doesn't fit.
  const visible: Item[] = []
  let used = 0
  for (const item of items) {
    if (used + height(item) > (itemLines <= room ? room : room - 1)) break
    visible.push(item)
    used += height(item)
  }
  const shown = visible.flatMap((i) => (i.extra ? [i.line, i.extra] : [i.line]))
  const hidden = items.length - visible.length
  if (hidden > 0) shown.push(c.dim(`${INDENT}${t('r.more', hidden)}`))
  if (evidence) shown.push(`${INDENT}${c.dim(evidence)}`)
  return [...lines, ...shown, ...footer].join('\n')
}

function conclusion(upgradable: number, needConfirm: number): string {
  if (upgradable === 0 && needConfirm === 0) return c.green(t('r.allGood'))
  const parts: string[] = []
  if (upgradable) parts.push(t('r.upgradable', upgradable))
  if (needConfirm) parts.push(t('r.needReview', needConfirm))
  return c.bold(t('r.summary', parts.join(t('r.summaryJoin'))))
}

function worstFinding(v: SkillVerdict): Finding | undefined {
  return [...v.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || areaRank(a) - areaRank(b))[0]
}

function areaRank(f: Finding): number {
  return { upstream: 0, local: 1, usage: 2, plugin: 3 }[f.area]
}

function itemLine(symbol: string, subject: string, message: string): string {
  return `${INDENT}${symbol} ${padDisplay(subject, 16)} ${message}`
}

function shortSubject(s: string): string {
  if (s.length <= 24) return s
  const parts = s.replaceAll('\\', '/').split('/')
  return `…/${parts.slice(-2).join('/')}`
}

function colorCount(n: number, color: (s: string) => string): string {
  return n > 0 ? color(String(n)) : String(n)
}

/** Every finding with detail, for `check --all` follow-up reading. */
export function renderDetails(r: CheckResult): string {
  const out: string[] = []
  const all = [...r.pluginFindings, ...r.verdicts.flatMap((v) => v.findings), ...r.orphanFindings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  for (const f of all) {
    if (f.severity === 'info') continue
    out.push(`${c.bold(f.subject)}  [${f.severity}] ${f.message}`)
    for (const d of f.detail ?? []) out.push(`    ${c.dim(d)}`)
  }
  return out.join('\n')
}

export function checkJson(r: CheckResult) {
  return {
    platform: { id: r.platform.id, profile: r.platform.profile, host: r.platform.host },
    plugins: r.plugins,
    skills: r.verdicts.map((v) => ({
      name: v.skill.skill.name,
      state: v.state,
      file: v.skill.file,
      source: v.skill.root.source,
      provenance: v.provenance,
      upstream: v.upstream ? { state: v.upstream.state, ...('commit' in v.upstream ? { commit: v.upstream.commit } : {}) } : undefined,
      findings: v.findings,
      ...(v.explanation ? { explanation: v.explanation } : {}),
    })),
    other: r.orphanFindings,
    recorded: r.newEvents.length,
    ...(r.explain ? { explain: r.explain } : {}),
  }
}

const RUNTIME_SHOWN = 10

export function renderInventory(inv: Inventory, runtimeSkills: string[] = [], options: { all?: boolean } = {}): string {
  const out: string[] = []
  out.push(c.bold(t('ls.header', inv.platform.label, inv.platform.projectRoot)))
  for (const root of inv.platform.roots) out.push(c.dim(`  [${root.rank}] ${root.source.padEnd(15)} ${root.path}${root.agent ? `  (${root.agent})` : ''}`))
  out.push('')
  for (const s of inv.active) out.push(`${c.green('●')} ${s.skill.name.padEnd(28)} ${c.dim(s.root.source)}${s.skill.invocation.modelInvocable ? '' : c.dim(t('ls.manual'))}`)
  for (const s of inv.shadowed) out.push(`${c.yellow('○')} ${s.skill.name.padEnd(28)} ${c.dim(t('ls.shadowed', s.root.source, s.shadowedBy!.root.source))}`)
  for (const d of inv.dropped) out.push(`${c.red('✗')} ${d.entryName.padEnd(28)} ${c.dim(d.parse.ok ? '' : d.parse.reason)}`)
  for (const n of inv.nested) out.push(`${c.red('✗')} ${n.dir}  ${c.dim(t('ls.nested', n.found.length))}`)
  for (const u of inv.unscanned) out.push(`${c.red('✗')} ${u.root.path}  ${c.dim(t('ls.unscanned', u.root.label, u.entries.length))}`)
  if (runtimeSkills.length) {
    out.push('', c.dim(t('ls.runtime', runtimeSkills.length)))
    const shown = options.all ? runtimeSkills : runtimeSkills.slice(0, RUNTIME_SHOWN)
    for (const name of shown) out.push(`${c.cyan('◆')} ${name}`)
    if (shown.length < runtimeSkills.length) out.push(c.dim(`  ${t('r.more', runtimeSkills.length - shown.length).replace('skill-healthcheck --all', 'skill-healthcheck ls --all')}`))
  }
  return out.join('\n')
}

export function renderJournal(events: JournalEvent[]): string {
  if (events.length === 0) return c.dim(t('log.empty'))
  const kindWidth = Math.max(...events.map((e) => displayWidth(t(`log.kind.${e.kind}`))))
  return events
    .map((e) => {
      const d = e.diff
      const bits: string[] = []
      if (d?.nameChanged) bits.push(t('log.nameChanged', d.nameChanged.from, d.nameChanged.to))
      if (d?.descriptionChanged) bits.push(t('log.descChanged'))
      if (d?.bodyDelta) bits.push(t('log.body', `${d.bodyDelta > 0 ? '+' : ''}${d.bodyDelta}`))
      if (d?.scriptsAdded) bits.push(t('log.scriptsAdded', d.scriptsAdded.join(', ')))
      if (d?.scriptsChanged) bits.push(t('log.scriptsChanged', d.scriptsChanged.join(', ')))
      if (d?.statusChanged) bits.push(`${d.statusChanged.from} → ${d.statusChanged.to}`)
      if (e.note && !bits.length) bits.push(e.note)
      const time = new Date(e.t).toTimeString().slice(0, 5)
      const when = `${localDay(e.t)} ${time}${e.estimated ? '~' : ' '}`
      return `${c.dim(when)} ${padDisplay(t(`log.kind.${e.kind}`), kindWidth)} ${e.name.padEnd(24)} ${c.dim(e.source ?? '')}  ${bits.join(t('log.join'))}`
    })
    .join('\n')
}

export function renderWhy(result: WhyResult, symptom?: string): string {
  const out: string[] = []
  const topic = result.symptoms.length ? result.symptoms.map(symptomTitle).join(t('why.topicJoin')) : t('why.noSymptom')
  out.push(c.bold(t('why.title', symptom ? ` "${symptom}"` : '', topic)))
  if (result.onset) out.push(t('why.onset', result.onset.evidence))
  else if (result.since) out.push(t('why.since', localDay(result.since)))
  if (result.suspects.length === 0) {
    out.push(c.dim(t('why.none')))
    return out.join('\n')
  }
  result.suspects.forEach((s, i) => {
    out.push(`${i === 0 ? c.red(`${i + 1}.`) : `${i + 1}.`} ${c.bold(s.name.padEnd(20))} ${s.what}`)
    for (const e of s.evidence.slice(0, 3)) out.push(`     ${c.dim(e)}`)
    if (s.explanation) out.push(`     ${c.dim(t('explain.line', s.explanation))}`)
  })
  if (result.explain) out.push(c.dim(result.explain.used ? t('explain.via', result.explain.provider, result.explain.model) : t('explain.none')))
  out.push(c.dim(t('why.footer')))
  return out.join('\n')
}
