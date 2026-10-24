// Local silent failures: things that make a skill invisible to the model without any
// error, detectable offline from disk and session logs.
import { relative } from 'node:path'
import { catalogDescription, type ParsedSkill } from './frontmatter.js'
import { t } from './i18n.js'
import { catalogLimit } from './platforms.js'
import { localDay, QUIET_SESSIONS, usageStats, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Finding, Inventory } from './types.js'

const DAY = 86_400_000

export function localFindings(inv: Inventory): Finding[] {
  const out: Finding[] = []
  for (const e of inv.errors) {
    out.push({ code: 'scan-error', severity: 'high', subject: e.path, message: t('local.scanError', e.path, e.reason), area: 'local' })
  }
  for (const entry of inv.dropped) {
    if (!entry.parse.ok) {
      const name = entry.parse.rawName ?? entry.entryName.replace(/\.md$/, '')
      // A flat README.md without frontmatter is noise, not a broken skill.
      const severity = entry.kind === 'flat' && entry.parse.code === 'missing-frontmatter' ? 'info' : 'critical'
      out.push({ code: 'dropped', severity, subject: name, message: t('local.dropped', agentLabel(entry.root.agent), entry.parse.reason), detail: [entry.file], area: 'local' })
    }
  }
  for (const s of inv.shadowed) {
    const winner = s.shadowedBy!
    const same = winner.raw === s.raw
    // dsh and Claude Code document which copy wins; Codex lists both to the model.
    const message = same
      ? t('local.shadowedSame', winner.root.source)
      : s.root.agent === 'codex'
        ? t('local.listedTwice', winner.root.source, agentLabel(s.root.agent))
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
      message: n.depthLimit ? t('local.nestedDeep', n.found.length, n.depthLimit) : t('local.nested', n.found.length),
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
  for (const s of inv.active) {
    for (const note of s.skill.notes ?? []) {
      if (note.code === 'frontmatter-ignored') {
        out.push({ code: 'frontmatter-ignored', severity: 'critical', subject: s.skill.name, message: t('local.frontmatterIgnored', note.reason), detail: [s.file], area: 'local' })
      } else {
        out.push({ code: 'no-description', severity: 'medium', subject: s.skill.name, message: t('local.descriptionFromBody', s.skill.description.slice(0, 60)), detail: [s.file], area: 'local' })
      }
    }
    const max = catalogLimit(inv.platform, s.root.agent)
    const listed = catalogText(s.skill, s.root.agent)
    if (max && listed.replaceAll(/\s+/g, ' ').trim().length > max) {
      const shown = catalogDescription(listed, max)
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

/** Display name of the agent that reads a root; dsh roots carry no agent. */
export function agentLabel(agent: string | undefined): string {
  return agent === 'claude-code' ? 'Claude Code' : agent === 'codex' ? 'Codex' : 'dsh'
}

/** What the catalog shows for a skill: Claude Code appends `when_to_use` to the description. */
export function catalogText(skill: Pick<ParsedSkill, 'description' | 'whenToUse'>, agent: string | undefined): string {
  return agent === 'claude-code' && skill.whenToUse ? `${skill.description} ${skill.whenToUse}` : skill.description
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
    // The three quiet sessions have to come *after* the change; sessions before it only mean
    // the skill was already unused when its description changed.
    const quietAfterChange = change ? quietSessionsAfter(sessions, s.skill.name, change.t) : 0
    const explainsSilence = change !== undefined && quietAfterChange >= QUIET_SESSIONS
    const detail = [t('usage.lastCall', localDay(usage.lastCall), usage.quietSessions)]
    if (change) detail.push(t('usage.descChangedOn', localDay(change.t)))
    out.push({
      code: 'went-quiet',
      severity: explainsSilence ? 'critical' : 'high',
      subject: s.skill.name,
      message: explainsSilence ? t('usage.quietAfterChange', usage.calls, localDay(change.t)) : t('usage.quiet', usage.calls, localDay(usage.lastCall)),
      detail,
      area: 'usage',
    })
  }
  return out
}

/** Sessions created after `since` whose catalog still listed the skill. */
function quietSessionsAfter(sessions: SessionSummary[], name: string, since: number): number {
  return sessions.filter((s) => (s.createdAt ?? 0) > since && s.catalogs.some((c) => c.entries.some((e) => e.name === name))).length
}
