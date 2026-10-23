// Mirrors @deepseek-ai/dsh-skill-filesystem's SKILL.md parsing so that "dropped" here
// means exactly "dsh silently ignores this file". Keep in sync with dsh 0.2.x.
import { parse } from 'yaml'

export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface InvocationPolicy {
  modelInvocable: boolean
  userInvocable: boolean
}

export interface ParsedSkill {
  name: string
  description: string
  whenToUse?: string
  invocation: InvocationPolicy
  metadata?: Record<string, unknown>
  body: string
}

export type DropCode =
  | 'missing-frontmatter'
  | 'invalid-yaml'
  | 'missing-name-or-description'
  | 'invalid-name'
  | 'invalid-invocation'

export type ParseResult =
  | { ok: true; skill: ParsedSkill }
  | { ok: false; code: DropCode; reason: string; rawName?: string }

const LEGACY_KEYS: Array<[string, string]> = [
  ['disableModelInvocation', 'disable-model-invocation'],
  ['modelInvocable', 'disable-model-invocation'],
  ['userInvocable', 'user-invocable'],
]

export function parseSkillText(raw: string): ParseResult {
  let split: { data: Record<string, unknown>; body: string } | undefined
  try {
    split = splitFrontmatter(raw)
  } catch (error) {
    return { ok: false, code: 'invalid-yaml', reason: `YAML 解析失败：${firstLine(error)}` }
  }
  if (!split) return { ok: false, code: 'missing-frontmatter', reason: '缺少 YAML frontmatter（文件必须以 --- 开头）' }
  const { data, body } = split
  const name = stringField(data, 'name')
  const description = stringField(data, 'description')
  const rawName = typeof data.name === 'string' ? data.name : undefined
  if (name === undefined || description === undefined) {
    return { ok: false, code: 'missing-name-or-description', reason: 'frontmatter 必须同时有 name 和 description', rawName }
  }
  if (!SKILL_NAME.test(name)) {
    return { ok: false, code: 'invalid-name', reason: `name "${name}" 不是 kebab-case（只允许小写字母、数字和单个连字符）`, rawName }
  }
  let invocation: InvocationPolicy
  try {
    invocation = parseInvocationPolicy(data)
  } catch (error) {
    return { ok: false, code: 'invalid-invocation', reason: firstLine(error), rawName }
  }
  const skill: ParsedSkill = { name, description, invocation, body: body.trim() }
  const whenToUse = stringField(data, 'whenToUse')
  if (whenToUse !== undefined) skill.whenToUse = whenToUse
  const metadata = data.metadata
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    skill.metadata = metadata as Record<string, unknown>
  }
  return { ok: true, skill }
}

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      const parsed: unknown = parse(raw.slice(start, lineStart))
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
      return { data: parsed as Record<string, unknown>, body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1) }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

function parseInvocationPolicy(data: Record<string, unknown>): InvocationPolicy {
  for (const [legacy, canonical] of LEGACY_KEYS) {
    if (Object.hasOwn(data, legacy)) throw new Error(`字段 "${legacy}" 已不支持，应改为 "${canonical}"`)
  }
  const disableModelInvocation = frontmatterBoolean(data, 'disable-model-invocation')
  const userInvocable = frontmatterBoolean(data, 'user-invocable')
  return { modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false }
}

function frontmatterBoolean(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
    }
  }
  throw new TypeError(`字段 "${key}" 必须是布尔值，当前是 ${JSON.stringify(value)}`)
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function firstLine(error: unknown): string {
  return String(error instanceof Error ? error.message : error).split('\n')[0] ?? ''
}

/** dsh-tool-skill's catalog rendering: whitespace collapsed, cut at maxLength with "...". */
export function catalogDescription(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`
}
