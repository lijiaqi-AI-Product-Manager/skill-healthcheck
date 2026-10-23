// Local silent failures: things that make a skill invisible to the model without any
// error, detectable offline from disk and session logs.
import { relative } from 'node:path'
import { catalogDescription } from './frontmatter.js'
import { localDay, usageStats, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Finding, Inventory } from './types.js'

const DAY = 86_400_000

export function localFindings(inv: Inventory): Finding[] {
  const out: Finding[] = []
  const isDsh = inv.platform.id === 'dsh'
  for (const entry of inv.dropped) {
    if (!entry.parse.ok) {
      const name = entry.parse.rawName ?? entry.entryName.replace(/\.md$/, '')
      // A flat README.md without frontmatter is noise, not a broken skill.
      const severity = entry.kind === 'flat' && entry.parse.code === 'missing-frontmatter' ? 'info' : 'critical'
      out.push({
        code: 'dropped',
        severity,
        subject: name,
        message: `${isDsh ? 'dsh' : 'agent'} 会静默丢弃它：${entry.parse.reason}`,
        detail: [entry.file],
        area: 'local',
      })
    }
  }
  for (const s of inv.shadowed) {
    const winner = s.shadowedBy!
    const same = winner.raw === s.raw
    out.push({
      code: 'shadowed',
      severity: same ? 'info' : 'high',
      subject: s.skill.name,
      message: same ? `与 ${winner.root.source} 中的同名副本重复（内容相同）` : `被 ${winner.root.source} 里的同名技能遮蔽，这份永远不会生效`,
      detail: [`生效：${winner.file}`, `被遮蔽：${s.file}`],
      area: 'local',
    })
  }
  for (const n of inv.nested) {
    out.push({
      code: 'nested',
      severity: 'high',
      subject: relative(n.root.path, n.dir) || n.dir,
      message: `目录里有 ${n.found.length} 个技能嵌套太深，只认 <根>/<名>/SKILL.md`,
      detail: n.found.slice(0, 5).map((f) => `${n.dir}/${f}`.replaceAll('\\', '/')),
      area: 'local',
    })
  }
  for (const u of inv.unscanned) {
    out.push({
      code: 'unscanned-root',
      severity: 'high',
      subject: u.root.path,
      message: `${u.root.why}，这里的 ${u.entries.length} 个技能都不会加载`,
      detail: u.entries.slice(0, 5).map((e) => (e.parse.ok ? e.parse.skill.name : e.entryName)),
      area: 'local',
    })
  }
  const max = inv.platform.catalogMaxLength
  for (const s of inv.active) {
    if (max && s.skill.description.replaceAll(/\s+/g, ' ').trim().length > max) {
      const shown = catalogDescription(s.skill.description, max)
      out.push({
        code: 'description-truncated',
        severity: 'medium',
        subject: s.skill.name,
        message: `description 超过 ${max} 字符，目录里被截断，结尾的触发词模型看不到`,
        detail: [`显示到：…${shown.slice(-60)}`],
        area: 'local',
      })
    }
    if (!s.skill.invocation.modelInvocable) {
      out.push({
        code: 'model-invocation-disabled',
        severity: 'info',
        subject: s.skill.name,
        message: `disable-model-invocation: true，只能手动 /${s.skill.name}`,
        area: 'local',
      })
    }
  }
  return out
}

/**
 * Evidence from session logs: a skill that used to be called and then went quiet while
 * still in the catalog, especially right after its description changed.
 */
export function usageFindings(inv: Inventory, sessions: SessionSummary[], timeline: CatalogTimeline): Finding[] {
  const out: Finding[] = []
  if (sessions.length === 0) return out
  for (const s of inv.active) {
    const usage = usageStats(sessions, s.skill.name)
    if (usage.calls < 2 || usage.lastCall === undefined || usage.quietSessions < 3) continue
    const change = timeline.changes.filter((c) => c.name === s.skill.name && c.t <= usage.lastCall! + 14 * DAY && c.t >= usage.lastCall! - DAY).at(-1)
    const detail = [`最后一次调用：${localDay(usage.lastCall)}，之后 ${usage.quietSessions} 个会话目录里都有它却没用过`]
    if (change) detail.push(`${localDay(change.t)} 模型看到的 description 变了`)
    out.push({
      code: 'went-quiet',
      severity: change ? 'critical' : 'high',
      subject: s.skill.name,
      message: change
        ? `调用 ${usage.calls} 次后，自 ${localDay(change.t)} description 改动起 0 次`
        : `曾被调用 ${usage.calls} 次，${localDay(usage.lastCall)} 后再没被用过`,
      detail,
      area: 'usage',
    })
  }
  return out
}
