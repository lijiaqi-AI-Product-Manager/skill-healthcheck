// Change impact: "will this update break what works for you now?" Pure functions over
// two versions of a skill, so every rule is unit-testable without git or a filesystem.
import { catalogDescription, type ParseResult, type ParsedSkill } from './frontmatter.js'
import { currentOs, loadLexicon, signalHits, tokenSupports, type OsName } from './lexicon.js'
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
    add('upstream-invalid', 'critical', `上游新版本会被静默丢弃：${input.after.reason}`)
    return out
  }
  const after = input.after.skill

  if (before.name !== after.name) {
    add('name-changed', 'critical', `上游改名为 ${after.name} → 你的 /${before.name} 会失效`, [`新入口：/${after.name}`])
  }
  if (before.invocation.modelInvocable && !after.invocation.modelInvocable) {
    add('model-invocation-disabled', 'critical', '上游加了 disable-model-invocation，模型将不再自动使用它')
  }
  if (before.invocation.userInvocable && !after.invocation.userInvocable) {
    add('user-invocation-disabled', 'critical', `上游加了 user-invocable: false，/${before.name} 会失效`)
  }

  if (normalizeSpace(before.description) !== normalizeSpace(after.description)) {
    const { removed, added } = wordDiff(before.description, after.description)
    const newSignals = signalHits(after.description).filter((h) => !before.description.toLowerCase().includes(h.hit.toLowerCase()))
    const parts: string[] = []
    if (removed.length) parts.push(`删去 ${quoteWords(removed.slice(0, 3))}`)
    if (added.length) parts.push(`新增 ${quoteWords(added.slice(0, 3))}`)
    const detail = [`旧：${clip(before.description, 160)}`, `新：${clip(after.description, 160)}`]
    for (const h of newSignals) detail.push(`新增"${h.hit}"（${h.symptom.title_zh}）`)
    // Calibrated on 44 real description changes: dropping words is what loses triggers;
    // a description that only grew mostly widens when the skill fires.
    const severity: Severity = removed.length > 0 ? 'critical' : newSignals.length > 0 ? 'high' : 'medium'
    const verb = removed.length > 0 ? '改了' : '扩写了'
    add('description-changed', severity, `上游${verb} description：${parts.join('，') || '措辞调整'}`, detail)
  }

  if (input.catalogMaxLength) {
    const max = input.catalogMaxLength
    const beforeLen = normalizeSpace(before.description).length
    const afterLen = normalizeSpace(after.description).length
    if (afterLen > max && beforeLen <= max) {
      const shown = catalogDescription(after.description, max)
      const lost = normalizeSpace(after.description).slice(max - 3)
      add('description-truncated', 'high', `description 变为 ${afterLen} 字符，超过 ${max} 会被截断`, [`模型看不到的结尾：…${clip(lost, 80)}`, `目录中显示：${clip(shown, 80)}`])
    } else if (afterLen > beforeLen * 1.5 && afterLen - beforeLen > 120) {
      add('description-grew', 'low', `description 变长 ${afterLen - beforeLen} 字符，每轮都多占目录上下文`)
    }
  }

  if (input.scripts?.added.length) {
    const os = input.os ?? currentOs()
    const foreign = input.scripts.added.filter((f) => (os === 'windows' ? /\.(sh|bash|zsh)$/.test(f) : /\.(ps1|bat|cmd)$/.test(f)))
    const detail = input.scripts.added.map((f) => `scripts/${f}`)
    if (foreign.length) detail.push(`其中 ${foreign.join(', ')} 在当前系统上可能跑不起来`)
    add('scripts-added', 'high', `新增 ${input.scripts.added.length} 个脚本，需人工审代码后再用`, detail)
  }
  if (input.scripts?.changed.length) {
    add('scripts-changed', 'medium', `${input.scripts.changed.length} 个脚本内容有改动，需复核`, input.scripts.changed.map((f) => `scripts/${f}`))
  }

  const bodyDelta = after.body.length - before.body.length
  if (bodyDelta > 2000) {
    add('body-grew', 'low', `正文 +${formatChars(bodyDelta)}（每次调用约 +${estimateTokens(after.body) - estimateTokens(before.body)} token）`)
  }

  const os = input.os ?? currentOs()
  const platformHits = newPlatformTokens(`${before.description}\n${before.body}`, `${after.description}\n${after.body}`, os)
  if (platformHits.length) {
    add(
      'platform-specific',
      'medium',
      `新增了 ${[...new Set(platformHits.map((h) => h.label))].join('、')} 专用写法，在你的 ${osLabel(os)} 上可能失效`,
      platformHits.map((h) => `${h.match}：${h.explain}`),
    )
  }
  if (input.movedTo !== undefined && before.name === after.name) {
    add('moved-in-repo', 'medium', `上游把技能移到了 ${input.movedTo}`)
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
    hits.push({ label: token.only_on.map(osLabel).join('/'), match: m[0].trim(), explain: token.explain_zh })
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

/** Words that disappeared from / appeared in a description, most informative first. */
export function wordDiff(before: string, after: string): { removed: string[]; added: string[] } {
  const b = new Set(words(before))
  const a = new Set(words(after))
  // "discovers" -> "discover" is a rewording, not a lost trigger.
  const bStems = new Set([...b].map(stem))
  const aStems = new Set([...a].map(stem))
  const rank = (list: string[]) => list.sort((x, y) => weight(y) - weight(x)).slice(0, 5)
  return { removed: rank([...b].filter((w) => !aStems.has(stem(w)))), added: rank([...a].filter((w) => !bStems.has(stem(w)))) }
}

function stem(w: string): string {
  return /^[a-z]+$/.test(w) && w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w
}

function weight(w: string): number {
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

function formatChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k 字符` : `${n} 字符`
}

function osLabel(os: string): string {
  return { windows: 'Windows', macos: 'macOS', linux: 'Linux', posix: 'macOS/Linux' }[os] ?? os
}

function normalizeSpace(s: string): string {
  return s.replaceAll(/\s+/g, ' ').trim()
}

function clip(s: string, n: number): string {
  const t = normalizeSpace(s)
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}
