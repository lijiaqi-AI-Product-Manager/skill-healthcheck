// Attribution: given a symptom ("why doesn't it answer in Chinese anymore?") and/or a
// time, rank what changed. Deterministic: symptom lexicon x time proximity x behavior
// change points from session logs. It ranks suspects; it does not prove guilt.
import type { ExplainStatus } from './check.js'
import { Explainer, resolveProvider, type Provider } from './explain.js'
import { t } from './i18n.js'
import type { JournalEvent, Store } from './journal.js'
import { loadLexicon, signalHits, type Symptom } from './lexicon.js'
import { parseSkillText } from './frontmatter.js'
import { languageByDay, localDay, QUIET_SESSIONS, usageStats, type CatalogTimeline, type SessionSummary } from './sessions.js'
import type { Inventory } from './types.js'
import { stem, wordDiff } from './impact.js'

const DAY = 86_400_000

export interface Suspect {
  name: string
  score: number
  /** When the suspicious change happened (best estimate). */
  t?: number
  what: string
  evidence: string[]
  /** The description change behind the suspicion, when there is one (for --explain). */
  change?: { from: string; to: string }
  /** --explain: how this change could cause the symptom, in one sentence. */
  explanation?: string
}

export interface WhyResult {
  symptoms: Symptom[]
  onset?: { t: number; evidence: string }
  since?: number
  suspects: Suspect[]
  explain?: ExplainStatus
}

/**
 * --explain for why: one sentence on what the top suspect's change means for the user.
 * The complaint text is deliberately not sent: `--explain` promises skill text only.
 */
export async function explainWhy(result: WhyResult, explain: true | Provider, store: Store): Promise<void> {
  const provider = explain === true ? resolveProvider() : explain
  if (!provider) {
    result.explain = { used: false }
    return
  }
  const top = result.suspects[0]
  if (top?.change) {
    const explainer = new Explainer(provider, store)
    const { removed, added } = wordDiff(top.change.from, top.change.to)
    top.explanation = await explainer.explain({
      skill: top.name,
      codes: ['description-changed'],
      before: { name: top.name, description: top.change.from },
      after: { name: top.name, description: top.change.to },
      removedWords: removed,
      addedWords: added,
    })
    explainer.save()
  }
  result.explain = { used: true, provider: provider.id, model: provider.model }
}

const MATCH_THRESHOLD = 0.6
// Bigrams every complaint shares; they say nothing about which symptom it is.
const FILLER_BIGRAMS = new Set(['为什', '什么', '怎么', '现在', '最近', '突然', '一直', '它现', '我了', '了吗', '为何', '么它', '么现', '么最', '么突'])

/** Symptoms whose example phrases resemble the complaint; tolerant of extra words like "它现在". */
export function matchSymptoms(text: string): Symptom[] {
  const scored = loadLexicon()
    .symptoms.map((s) => ({ s, score: Math.max(0, ...s.user_phrases.map((p) => phraseScore(p, text))) }))
    .filter((x) => x.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
  const best = scored[0]?.score ?? 0
  return scored.filter((x) => x.score >= best - 0.15).map((x) => x.s)
}

/** Share of the phrase's CJK bigrams and Latin words that also occur in the text. */
export function phraseScore(phrase: string, text: string): number {
  const p = phrase.toLowerCase()
  const lower = text.toLowerCase()
  if (lower.includes(p)) return 1
  const pg = grams(p)
  if (pg.size < 2) return 0
  const tg = grams(lower)
  let hit = 0
  for (const g of pg) if (tg.has(g)) hit++
  return hit < 2 ? 0 : hit / pg.size
}

function grams(s: string): Set<string> {
  const out = new Set<string>()
  for (const run of s.match(/[一-鿿]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) {
      const g = run.slice(i, i + 2)
      if (!FILLER_BIGRAMS.has(g)) out.add(g)
    }
  }
  for (const w of s.match(/[a-z]{3,}/g) ?? []) if (!['why', 'the', 'now', 'and', 'did', 'does', 'its'].includes(w)) out.add(stemWord(w))
  return out
}

/** answering / answers / answered -> answer. Shared with `impact` so both sides agree. */
function stemWord(w: string): string {
  return stem(w) || w
}

/** First day the assistant's share of Chinese collapsed while the user kept writing Chinese. */
export function languageOnset(sessions: SessionSummary[]): { t: number; evidence: string } | undefined {
  const days = languageByDay(sessions).filter((d) => d.asst !== undefined)
  for (let i = 1; i < days.length; i++) {
    const before = days.slice(Math.max(0, i - 7), i)
    const avgBefore = before.reduce((s, d) => s + d.asst!, 0) / before.length
    const cur = days[i]!
    const userZh = cur.user === undefined || cur.user > 0.5
    if (avgBefore > 0.6 && cur.asst! < 0.3 && userZh) {
      return {
        t: Date.parse(`${cur.day}T00:00:00`),
        evidence: t('why.languageOnset', cur.day, pct(avgBefore), pct(cur.asst!)),
      }
    }
  }
  return undefined
}

export function why(params: {
  symptom?: string
  since?: number
  inventory: Inventory
  journal: JournalEvent[]
  store: Store
  sessions: SessionSummary[]
  timeline: CatalogTimeline
}): WhyResult {
  const symptoms = params.symptom ? matchSymptoms(params.symptom) : []
  const onset = symptoms.some((s) => s.id === 'language') ? languageOnset(params.sessions) : undefined
  const anchor = params.since ?? onset?.t
  const suspects = new Map<string, Suspect>()
  const bump = (name: string, score: number, when: number | undefined, what: string, evidence: string[], change?: Suspect['change']) => {
    const cur = suspects.get(name)
    if (!cur || score > cur.score) {
      const next: Suspect = { name, score, t: when, what, evidence: [...new Set([...(cur?.evidence ?? []), ...evidence])] }
      const keep = change ?? cur?.change
      if (keep) next.change = keep
      suspects.set(name, next)
    } else {
      cur.evidence = [...new Set([...cur.evidence, ...evidence])]
      cur.change ??= change
    }
  }
  const proximity = (when: number | undefined) => {
    if (anchor === undefined || when === undefined) return 1
    const days = (anchor - when) / DAY
    if (days < -1) return 0.15 // happened after the symptom started: unlikely cause
    return Math.max(0.2, 1.5 - Math.abs(days) / 10)
  }

  // A changed description is itself the usual reason a skill stops triggering.
  const notTriggered = symptoms.some((s) => s.id === 'skill-not-triggered')

  // 1) What the model actually saw change (session catalogs), including before the first run.
  for (const change of params.timeline.changes) {
    const hits = newHits(change.from, change.to, symptoms)
    // A rule that used to demand the thing the user now misses is evidence too: this is what
    // a Chinese-pinned skill looks like when upstream drops the requirement.
    const lost = lostHits(change.from, change.to, symptoms)
    const { removed, added: addedWords } = wordDiff(change.from, change.to)
    if (symptoms.length && hits.length === 0 && lost.length === 0 && !notTriggered) continue
    const base = symptoms.length ? hits.length * 2 + lost.length * 1.5 + (notTriggered ? 1 + removed.length * 0.5 : 0) : 0.5
    bump(change.name, (base + 1) * proximity(change.t), change.t, t('why.catalogChanged', localDay(change.t)), [
      ...hits.map((h) => t('why.added', h)),
      ...lost.map((h) => t('why.lost', h)),
      ...(removed.length ? [t('why.removedWords', removed.map((w) => `"${w}"`).join(' '))] : []),
      ...(addedWords.length && !hits.length ? [t('why.addedWords', addedWords.map((w) => `"${w}"`).join(' '))] : []),
    ], { from: change.from, to: change.to })
  }

  // 2) The recorder's journal: installs and content changes, with full text from the blob store.
  for (const e of params.journal) {
    if (e.kind !== 'added' && e.kind !== 'changed' && e.kind !== 'baseline' && e.kind !== 'moved') continue
    if (!e.after) continue
    const afterText = params.store.getBlob(e.after.sha) ?? ''
    const beforeText = e.before ? (params.store.getBlob(e.before.sha) ?? '') : ''
    const before = e.kind === 'baseline' || e.kind === 'added' ? '' : beforeText
    const hits = newHits(before, afterText, symptoms)
    // Dropping a rule is evidence too, and the journal is the only place that sees it when
    // there is no catalog history.
    const lost = lostHits(before, afterText, symptoms)
    if (symptoms.length && hits.length === 0 && lost.length === 0) continue
    if (!symptoms.length && e.kind === 'baseline') continue
    const verb = t(`why.verb.${e.kind}`)
    const when = `${localDay(e.t)}${e.estimated ? t('why.estimated') : ''}`
    const weight = e.kind === 'baseline' ? 0.6 : 1
    const change = e.before?.description !== undefined && e.after.description !== undefined && e.before.description !== e.after.description ? { from: e.before.description, to: e.after.description } : undefined
    bump(e.name, ((symptoms.length ? hits.length * 2 + lost.length * 1.5 : 0.5) + 1) * weight * proximity(e.t), e.t, `${when} ${verb}`, [...hits.map((h) => t('why.contains', h)), ...lost.map((h) => t('why.lost', h))], change)
  }

  // 3) Currently active skills whose text matches, even with no recorded change.
  if (symptoms.length) {
    for (const s of params.inventory.active) {
      const hits = relevantHits(`${s.skill.description}\n${s.skill.body}`, symptoms)
      if (hits.length === 0) continue
      bump(s.skill.name, hits.length * 0.8 * (anchor ? 0.5 : 1), undefined, t('why.activeMatch'), hits.map((h) => t('why.contains', h)))
    }
  }

  // 4) "Skill stopped being used" symptoms: rank by usage drop.
  // Includes skills that only exist in the logs (plugin-provided or built into the host).
  if (notTriggered) {
    const names = new Set([...params.inventory.active.map((s) => s.skill.name), ...params.sessions.flatMap((s) => s.skillCalls.map((c) => c.name))])
    for (const name of names) {
      const u = usageStats(params.sessions, name)
      if (u.calls >= 2 && u.quietSessions >= QUIET_SESSIONS) {
        bump(name, 2 + Math.min(u.quietSessions, 10) / 5, u.lastCall, t('why.quiet', localDay(u.lastCall!)), [t('why.quietEvidence', u.calls, u.quietSessions)])
      }
    }
  }

  const ranked = [...suspects.values()].sort((a, b) => b.score - a.score).slice(0, 5)
  return { symptoms, onset, since: params.since, suspects: ranked }
}

function relevantHits(text: string, symptoms: Symptom[]): string[] {
  if (!text) return []
  const pool = symptoms.length ? symptoms : loadLexicon().symptoms
  const hits = [...new Set(signalHits(text, pool).map((h) => h.hit))]
  // "respond in english" and "Always respond in English" are one piece of evidence.
  return hits.filter((h) => !hits.some((o) => o !== h && o.toLowerCase().includes(h.toLowerCase())))
}

/** Signal phrases present after a change but not before it. */
function newHits(before: string, after: string, symptoms: Symptom[]): string[] {
  const old = new Set(relevantHits(skillText(before), symptoms).map((h) => h.toLowerCase()))
  return relevantHits(skillText(after), symptoms).filter((h) => !old.has(h.toLowerCase()))
}

/** Signal phrases that were there before the change and are gone now. */
function lostHits(before: string, after: string, symptoms: Symptom[]): string[] {
  const now = new Set(relevantHits(skillText(after), symptoms).map((h) => h.toLowerCase()))
  return relevantHits(skillText(before), symptoms).filter((h) => !now.has(h.toLowerCase()))
}

/** Description + body of a SKILL.md, or the text itself when it's just a description. */
function skillText(text: string): string {
  const parsed = parseSkillText(text)
  if (!parsed.ok) return text
  return `${parsed.skill.description}\n${parsed.skill.body}`
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}
