// Local silent failures: things that make a skill invisible to the model without any
// error, detectable offline from disk and session logs.
import { relative } from 'node:path'
import { catalogDescription } from './frontmatter.js'
import { t } from './i18n.js'
import { localDay, QUIET_SESSIONS, usageStats, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Finding, Inventory } from './types.js'

const DAY = 86_400_000

export function localFindings(inv: Inventory): Finding[] {
  const out: Finding[] = []
  const who = inv.platform.id === 'dsh' ? t('local.dropper.dsh') : t('local.dropper.agent')
  for (const entry of inv.dropped) {
    if (!entry.parse.ok) {
      const name = entry.parse.rawName ?? entry.entryName.replace(/\.md$/, '')
      // A flat README.md without frontmatter is noise, not a broken skill.
      const severity = entry.kind === 'flat' && entry.parse.code === 'missing-frontmatter' ? 'info' : 'critical'
      out.push({ code: 'dropped', severity, subject: name, message: t('local.dropped', who, entry.parse.reason), detail: [entry.file], area: 'local' })
    }
  }
  for (const s of inv.shadowed) {
    const winner = s.shadowedBy!
    const same = winner.raw === s.raw
    // dsh's precedence is documented and mirrored exactly; other agents' isn't, so only say "conflict".
    const message = same
      ? t('local.shadowedSame', winner.root.source)
      : s.root.agent
        ? t('local.conflict', winner.root.source, s.root.agent)
        : t('local.shadowed', winner.root.source)
    out.push({
      code: 'shadowed',
      severity: same ? 'info' : 'high',
      subject: s.skill.name,
      message,
      detail: [t('local.active', winner.file), t('local.loser', s.file)],
      area: 'local',
    })
  }
  for (const n of inv.nested) {
    out.push({
      code: 'nested',
      severity: 'high',
      subject: relative(n.root.path, n.dir) || n.dir,
      message: t('local.nested', n.found.length),
      detail: n.found.slice(0, 5).map((f) => `${n.dir}/${f}`.replaceAll('\\', '/')),
      area: 'local',
    })
  }
  for (const u of inv.unscanned) {
    out.push({
      code: 'unscanned-root',
      severity: 'high',
      subject: u.root.path,
      message: t('local.unscanned', u.root.label, u.entries.length),
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
        message: t('local.truncated', max),
        detail: [t('local.shownTo', shown.slice(-60))],
        area: 'local',
      })
    }
    if (!s.skill.invocation.modelInvocable) {
      out.push({ code: 'model-invocation-disabled', severity: 'info', subject: s.skill.name, message: t('local.manualOnly', s.skill.name), area: 'local' })
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
    if (usage.calls < 2 || usage.lastCall === undefined || usage.quietSessions < QUIET_SESSIONS) continue
    // The change must be able to explain the silence: the model's catalog last showed the old
    // text around the time it was still being called, and the new text appeared within two
    // weeks after that. A description edited long after the skill was already unused is not
    // the reason it stopped being called.
    const change = timeline.changes
      .filter((c) => c.name === s.skill.name && c.t <= usage.lastCall! + 14 * DAY && usage.lastCall! >= c.prevT - DAY)
      .sort((a, b) => b.t - a.t)[0]
    const detail = [t('usage.lastCall', localDay(usage.lastCall), usage.quietSessions)]
    if (change) detail.push(t('usage.descChangedOn', localDay(change.t)))
    out.push({
      code: 'went-quiet',
      severity: change ? 'critical' : 'high',
      subject: s.skill.name,
      message: change ? t('usage.quietAfterChange', usage.calls, localDay(change.t)) : t('usage.quiet', usage.calls, localDay(usage.lastCall)),
      detail,
      area: 'usage',
    })
  }
  return out
}
