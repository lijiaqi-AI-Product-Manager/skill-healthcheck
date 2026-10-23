import { severityRank, type CheckResult, type SkillVerdict } from './check.js'
import type { JournalEvent } from './journal.js'
import { localDay } from './sessions.js'
import type { Finding, Inventory } from './types.js'
import type { WhyResult } from './why.js'

const useColor = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== '0' : process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s)
export const c = { red: paint('31'), yellow: paint('33'), green: paint('32'), cyan: paint('36'), dim: paint('2'), bold: paint('1') }

const LINE_BUDGET = 15
const INDENT = '      '

interface Item {
  rank: number
  line: string
  evidence?: string
}

export function renderCheck(r: CheckResult, options: { all?: boolean } = {}): string {
  const lines: string[] = []
  const now = new Date()
  const profile = r.platform.profile ? ` · profile ${r.platform.profile}` : ''
  lines.push(c.bold(`skill-healthcheck · ${r.platform.label}${profile} · ${localDay(now.getTime())} ${now.toTimeString().slice(0, 5)}`))

  const host = r.platform.host
  lines.push(`宿主  ${host.name}${host.version ? ` ${host.version}` : ''} ${host.ok ? c.green('✓') : c.red('✗')}${host.detail ? c.dim(`  ${host.detail}`) : ''}`)

  const items: Item[] = []
  // Plugins
  let upgradable = 0
  if (r.plugins) {
    const ps = r.plugins.plugins
    const broken = ps.filter((p) => p.state === 'broken').length
    upgradable = ps.filter((p) => p.state === 'upgradable').length
    const ok = ps.length - broken - upgradable
    const tail = r.plugins.checkedRegistry || ps.length === 0 ? '' : c.dim('（离线，未查新版本）')
    const bundles = r.plugins.bundles.length ? c.dim(`  另有组合包 ${r.plugins.bundles.length} 个`) : ''
    lines.push(`插件  ${ps.length}：${ok} 正常 · ${upgradable} 可升级 · ${colorCount(broken, c.red)} 失效${tail}${bundles}`)
    for (const f of r.pluginFindings) items.push({ rank: severityRank(f.severity), line: itemLine(f.severity === 'critical' ? c.red('✗') : c.yellow('!'), f.subject, f.message) })
    for (const p of ps.filter((p) => p.state === 'upgradable')) items.push({ rank: 3, line: itemLine(c.cyan('↑'), p.name, `${p.version} → ${p.latest}`) })
  } else if (r.platform.id === 'dsh') {
    lines.push(`插件  ${c.dim('读不到 profile，跳过')}`)
  }

  // Skills
  const counts = { ok: 0, update: 0, broken: 0, unchecked: 0 }
  for (const v of r.verdicts) counts[v.state]++
  // One problem to fix = one count: a folder with 15 nested skills is one move, not 15 reviews.
  // The finding's message carries how many skills are inside.
  const extraCount = r.orphanFindings.filter((f) => f.severity === 'critical' || f.severity === 'high').length
  counts.broken += extraCount
  const total = r.verdicts.length + extraCount
  const bundled = r.verdicts.filter((v) => v.provenance.kind === 'bundled').length
  lines.push(
    `技能  ${total}：${counts.ok} 正常 · ${colorCount(counts.update, c.cyan)} 有更新 · ${colorCount(counts.broken, c.red)} 失效` +
      (counts.unchecked ? c.dim(` · ${counts.unchecked} 未检查`) : '') +
      (bundled ? c.dim(`  （含内置 ${bundled}）`) : ''),
  )
  for (const v of r.verdicts) {
    const worst = worstFinding(v)
    if (!worst || worst.severity === 'info' || (worst.severity === 'low' && !options.all)) continue
    const symbol = v.state === 'update' ? c.cyan('↑') : worst.severity === 'critical' || v.state === 'broken' ? c.red('✗') : c.yellow('!')
    const tag = v.state === 'update' && worst.severity === 'critical' ? c.red('  ⚠最高危') : v.state === 'update' && worst.severity === 'high' ? c.yellow('  高危') : ''
    const evidence = v.findings.find((f) => f.area === 'usage')
    items.push({
      rank: severityRank(worst.severity) - (v.state === 'broken' ? 0.5 : 0),
      line: itemLine(symbol, v.skill.skill.name, worst.message) + tag,
      evidence: evidence ? `证据：${v.skill.skill.name} ${evidence.message}` : undefined,
    })
  }
  for (const f of r.orphanFindings) {
    if (f.severity === 'info' || (f.severity === 'low' && !options.all)) continue
    items.push({ rank: severityRank(f.severity), line: itemLine(f.severity === 'critical' ? c.red('✗') : c.yellow('!'), shortSubject(f.subject), f.message) })
  }

  const unknown = r.verdicts.filter((v) => v.provenance.kind === 'unknown').length
  const footer: string[] = []
  if (unknown) footer.push(c.dim(`来源未知 ${unknown} 个，未检查上游 → skill-healthcheck adopt <name> <git-url>`))
  const needConfirm = counts.update + counts.broken
  footer.push(conclusion(upgradable, needConfirm))

  items.sort((a, b) => a.rank - b.rank)
  const evidence = items.find((i) => i.evidence)?.evidence
  const room = options.all ? items.length : Math.max(2, LINE_BUDGET - lines.length - footer.length - (evidence ? 1 : 0))
  // Keep one line for "...N more" when everything doesn't fit.
  const visible = items.length <= room ? items : items.slice(0, room - 1)
  const shown = visible.map((i) => i.line)
  const hidden = items.length - visible.length
  if (hidden > 0) shown.push(c.dim(`${INDENT}…另 ${hidden} 项（skill-healthcheck --all）`))
  if (evidence) shown.push(`${INDENT}${c.dim(evidence)}`)
  return [...lines, ...shown, ...footer].join('\n')
}

function conclusion(upgradable: number, needConfirm: number): string {
  if (upgradable === 0 && needConfirm === 0) return c.green('结论：都还在正常工作，没有需要你处理的')
  const parts: string[] = []
  if (upgradable) parts.push(`插件 ${upgradable} 个可一键升级`)
  if (needConfirm) parts.push(`技能 ${needConfirm} 个需你逐个确认`)
  return c.bold(`结论：${parts.join('；')}`)
}

function worstFinding(v: SkillVerdict): Finding | undefined {
  return [...v.findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || areaRank(a) - areaRank(b))[0]
}

function areaRank(f: Finding): number {
  return { upstream: 0, local: 1, usage: 2, plugin: 3 }[f.area]
}

function itemLine(symbol: string, subject: string, message: string): string {
  return `${INDENT}${symbol} ${subject.padEnd(16)} ${message}`
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
    })),
    other: r.orphanFindings,
    recorded: r.newEvents.length,
  }
}

export function renderInventory(inv: Inventory): string {
  const out: string[] = []
  out.push(c.bold(`${inv.platform.label} · 项目根 ${inv.platform.projectRoot}`))
  for (const root of inv.platform.roots) out.push(c.dim(`  [${root.rank}] ${root.source.padEnd(15)} ${root.path}`))
  out.push('')
  for (const s of inv.active) out.push(`${c.green('●')} ${s.skill.name.padEnd(28)} ${c.dim(s.root.source)}${s.skill.invocation.modelInvocable ? '' : c.dim('  (仅手动)')}`)
  for (const s of inv.shadowed) out.push(`${c.yellow('○')} ${s.skill.name.padEnd(28)} ${c.dim(`${s.root.source}，被 ${s.shadowedBy!.root.source} 遮蔽`)}`)
  for (const d of inv.dropped) out.push(`${c.red('✗')} ${d.entryName.padEnd(28)} ${c.dim(d.parse.ok ? '' : d.parse.reason)}`)
  for (const n of inv.nested) out.push(`${c.red('✗')} ${n.dir}  ${c.dim(`嵌套 ${n.found.length} 个技能，不会被发现`)}`)
  for (const u of inv.unscanned) out.push(`${c.red('✗')} ${u.root.path}  ${c.dim(`${u.root.why}（${u.entries.length} 个）`)}`)
  return out.join('\n')
}

const KIND_LABEL: Record<JournalEvent['kind'], string> = {
  baseline: '已存在',
  added: '新装',
  changed: '变更',
  removed: '删除',
  moved: '移动',
  status: '状态',
  adopted: '登记来源',
  'upstream-changed': '上游变更',
}

export function renderJournal(events: JournalEvent[]): string {
  if (events.length === 0) return c.dim('还没有记录。')
  return events
    .map((e) => {
      const d = e.diff
      const bits: string[] = []
      if (d?.nameChanged) bits.push(`name ${d.nameChanged.from} → ${d.nameChanged.to}`)
      if (d?.descriptionChanged) bits.push('description 变了')
      if (d?.bodyDelta) bits.push(`正文 ${d.bodyDelta > 0 ? '+' : ''}${d.bodyDelta} 字符`)
      if (d?.scriptsAdded) bits.push(`新增脚本 ${d.scriptsAdded.join(', ')}`)
      if (d?.scriptsChanged) bits.push(`脚本改动 ${d.scriptsChanged.join(', ')}`)
      if (d?.statusChanged) bits.push(`${d.statusChanged.from} → ${d.statusChanged.to}`)
      if (e.note && !bits.length) bits.push(e.note)
      const time = new Date(e.t).toTimeString().slice(0, 5)
      const when = `${localDay(e.t)} ${time}${e.estimated ? '~' : ' '}`
      return `${c.dim(when)} ${KIND_LABEL[e.kind].padEnd(4)} ${e.name.padEnd(24)} ${c.dim(e.source ?? '')}  ${bits.join('；')}`
    })
    .join('\n')
}

export function renderWhy(result: WhyResult, symptom?: string): string {
  const out: string[] = []
  const topic = result.symptoms.length ? result.symptoms.map((s) => s.title_zh).join('、') : '未匹配到已知症状，按时间列出变更'
  out.push(c.bold(`why${symptom ? ` "${symptom}"` : ''} → ${topic}`))
  if (result.onset) out.push(`现象起点：${result.onset.evidence}`)
  else if (result.since) out.push(`从 ${localDay(result.since)} 前后开始查`)
  if (result.suspects.length === 0) {
    out.push(c.dim('没找到可疑项。记录可能还太少，或者原因不在技能里。'))
    return out.join('\n')
  }
  result.suspects.forEach((s, i) => {
    out.push(`${i === 0 ? c.red(`${i + 1}.`) : `${i + 1}.`} ${c.bold(s.name.padEnd(20))} ${s.what}`)
    for (const e of s.evidence.slice(0, 3)) out.push(`     ${c.dim(e)}`)
  })
  out.push(c.dim('这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。'))
  return out.join('\n')
}
