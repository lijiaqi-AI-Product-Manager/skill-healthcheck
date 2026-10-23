// Change impact: "will this update break what works for you now?" Pure functions over
// two versions of a skill, so every rule is unit-testable without git or a filesystem.
import { catalogDescription, type ParseResult, type ParsedSkill } from './frontmatter.js'
import { t } from './i18n.js'
import { currentOs, loadLexicon, signalHits, symptomTitle, tokenExplain, tokenSupports, type OsName } from './lexicon.js'
import type { Finding, Severity } from './types.js'

export interface ImpactInput {
  name: string
  before: ParsedSkill
  after: ParseResult
  scripts?: { added: string[]; changed: string[]; removed: string[] }
  /** Platform catalog limit (dsh: 500). */
  catalogMaxLength?: number
  os?: OsName
  movedTo?: string
}

const CJK_TOKENS_PER_CHAR = 0.7
const LATIN_CHARS_PER_TOKEN = 4

export function assessImpact(input: ImpactInput): Finding[] {
  const out: Finding[] = []
  const add = (code: string, severity: Severity, message: string, detail?: string[]) =>
    out.push({ code, severity, subject: input.name, message, detail, area: 'upstream' })
  const { before } = input

  if (!input.after.ok) {
    add('upstream-invalid', 'critical', t('impact.invalid', input.after.reason))
    return out
  }
  const after = input.after.skill

  if (before.name !== after.name) {
    add('name-changed', 'critical', t('impact.renamed', after.name, before.name), [t('impact.newEntry', after.name)])
  }
  if (before.invocation.modelInvocable && !after.invocation.modelInvocable) {
    add('model-invocation-disabled', 'critical', t('impact.modelDisabled'))
  }
  if (before.invocation.userInvocable && !after.invocation.userInvocable) {
    add('user-invocation-disabled', 'critical', t('impact.userDisabled', before.name))
  }

  if (normalizeSpace(before.description) !== normalizeSpace(after.description)) {
    const { removed, added } = wordDiff(before.description, after.description)
    const newSignals = signalHits(after.description).filter((h) => !before.description.toLowerCase().includes(h.hit.toLowerCase()))
    const parts: string[] = []
    if (removed.length) parts.push(t('impact.removedWords', quoteWords(removed.slice(0, 3))))
    if (added.length) parts.push(t('impact.addedWords', quoteWords(added.slice(0, 3))))
    const detail = [t('impact.was', clip(before.description, 160)), t('impact.now', clip(after.description, 160))]
    for (const h of newSignals) detail.push(t('impact.newSignal', h.hit, symptomTitle(h.symptom)))
    // Calibrated on 44 real description changes: dropping words is what loses triggers;
    // a description that only grew mostly widens when the skill fires.
    const severity: Severity = removed.length > 0 ? 'critical' : newSignals.length > 0 ? 'high' : 'medium'
    const summary = parts.join(t('impact.join')) || t('impact.wording')
    add('description-changed', severity, removed.length > 0 ? t('impact.descChanged', summary) : t('impact.descExpanded', summary), detail)
  }

  if (input.catalogMaxLength) {
    const max = input.catalogMaxLength
    const beforeLen = normalizeSpace(before.description).length
    const afterLen = normalizeSpace(after.description).length
    if (afterLen > max && beforeLen <= max) {
      const shown = catalogDescription(after.description, max)
      const lost = normalizeSpace(after.description).slice(max - 3)
      add('description-truncated', 'high', t('impact.truncated', afterLen, max), [t('impact.hiddenTail', clip(lost, 80)), t('impact.catalogShows', clip(shown, 80))])
    } else if (afterLen > beforeLen * 1.5 && afterLen - beforeLen > 120) {
      add('description-grew', 'low', t('impact.descGrew', afterLen - beforeLen))
    }
  }

  if (input.scripts?.added.length) {
    const os = input.os ?? currentOs()
    const foreign = input.scripts.added.filter((f) => (os === 'windows' ? /\.(sh|bash|zsh)$/.test(f) : /\.(ps1|bat|cmd)$/.test(f)))
    const detail = input.scripts.added.map((f) => `scripts/${f}`)
    if (foreign.length) detail.push(t('impact.foreignScripts', foreign.join(', ')))
    add('scripts-added', 'high', t('impact.scriptsAdded', input.scripts.added.length), detail)
  }
  if (input.scripts?.changed.length) {
    add('scripts-changed', 'medium', t('impact.scriptsChanged', input.scripts.changed.length), input.scripts.changed.map((f) => `scripts/${f}`))
  }

  const bodyDelta = after.body.length - before.body.length
  if (bodyDelta > 2000) {
    add('body-grew', 'low', t('impact.bodyGrew', t('impact.chars', bodyDelta), estimateTokens(after.body) - estimateTokens(before.body)))
  }

  const os = input.os ?? currentOs()
  const platformHits = newPlatformTokens(`${before.description}\n${before.body}`, `${after.description}\n${after.body}`, os)
  if (platformHits.length) {
    add(
      'platform-specific',
      'medium',
      t('impact.platform', [...new Set(platformHits.map((h) => h.label))].join(' / '), osLabel(os)),
      platformHits.map((h) => `${h.match}: ${h.explain}`),
    )
  }
  if (input.movedTo !== undefined && before.name === after.name) {
    add('moved-in-repo', 'medium', t('impact.moved', input.movedTo))
  }
  return out
}

export function newPlatformTokens(beforeText: string, afterText: string, os: OsName) {
  const hits: Array<{ label: string; match: string; explain: string }> = []
  for (const token of loadLexicon().platform_tokens) {
    if (tokenSupports(token, os)) continue
    let re: RegExp
    try {
      re = new RegExp(token.regex, 'm')
    } catch {
      continue
    }
    const m = re.exec(afterText)
    if (!m || re.test(beforeText)) continue
    hits.push({ label: token.only_on.map(osLabel).join('/'), match: m[0].trim(), explain: tokenExplain(token) })
  }
  return hits
}

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'is', 'are', 'be', 'use', 'when', 'this', 'that', 'it', 'as', 'by', 'from', '的', '和', '或', '在', '用', '时', '与', '及', '了', '是', '把', '将', '让', '被', '成'])

export function words(text: string): string[] {
  const out: string[] = []
  for (const seg of segmenter.segment(text.toLowerCase())) {
    if (!seg.isWordLike) continue
    const w = seg.segment.trim()
    // Single CJK characters are usually fragments ("文" from 文档), not meaning.
    if (!w || STOP.has(w) || /^[一-鿿]$/.test(w)) continue
    out.push(w)
  }
  return out
}

/** Words that disappeared from / appeared in a description, most informative first, in their original casing. */
export function wordDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const b = new Set(words(before))
  const a = new Set(words(after))
  // "discovers" -> "discover" is a rewording, not a lost trigger.
  const bStems = new Set([...b].map(stem))
  const aStems = new Set([...a].map(stem))
  const rank = (list: string[], source: string) => list.sort((x, y) => weight(y) - weight(x)).slice(0, 5).map((w) => originalCase(w, source))
  return { removed: rank([...b].filter((w) => !aStems.has(stem(w))), before), added: rank([...a].filter((w) => !bStems.has(stem(w))), after) }
}

/** "chinese" back to "Chinese" as the author wrote it. */
function originalCase(word: string, source: string): string {
  const i = source.toLowerCase().indexOf(word)
  return i >= 0 ? source.slice(i, i + word.length) : word
}

function stem(w: string): string {
  return /^[a-z]+$/.test(w) && w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w
}

// Language names are usually the trigger itself ("Chinese writing assistant"); losing one
// matters more than any long word.
const LANGUAGE_WORDS = new Set(['chinese', 'english', 'japanese', 'korean', 'spanish', 'french', 'german', 'portuguese', 'russian', '中文', '英文', '英语', '汉语', '日文', '日语', '韩文', '韩语'])

function weight(w: string): number {
  if (LANGUAGE_WORDS.has(w)) return 100
  // CJK words carry more meaning per character than Latin ones.
  return /[一-鿿]/.test(w) ? w.length * 3 : w.length
}

function quoteWords(list: string[]): string {
  return list.map((w) => `"${w}"`).join(' ')
}

export function estimateTokens(text: string): number {
  const cjk = text.match(/[一-鿿]/g)?.length ?? 0
  return Math.round(cjk * CJK_TOKENS_PER_CHAR + (text.length - cjk) / LATIN_CHARS_PER_TOKEN)
}

function osLabel(os: string): string {
  return os === 'windows' || os === 'macos' || os === 'linux' || os === 'posix' ? t(`os.${os}`) : os
}

function normalizeSpace(s: string): string {
  return s.replaceAll(/\s+/g, ' ').trim()
}

function clip(s: string, n: number): string {
  const t = normalizeSpace(s)
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}
