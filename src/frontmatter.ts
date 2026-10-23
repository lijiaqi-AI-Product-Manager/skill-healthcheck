// SKILL.md parsing, one dialect per agent, so that "dropped" here means exactly "this agent
// silently ignores the file":
// - dsh: mirrors @deepseek-ai/dsh-skill-filesystem 0.2.x.
// - claude-code: the documented frontmatter rules (code.claude.com/docs/en/skills). Almost
//   nothing is dropped; a broken frontmatter loads with no fields instead.
// - codex: mirrors codex-rs/skills/src/parser.rs (name defaults to the folder, 64 chars max,
//   description required, colon-in-prose repair).
import { parse } from 'yaml'
import { t } from './i18n.js'

export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export type Dialect = 'dsh' | 'claude-code' | 'codex'

/** The dialect of the agent that reads a root; dsh roots carry no agent. */
export function dialectOf(agent: string | undefined): Dialect {
  return agent === 'claude-code' || agent === 'codex' ? agent : 'dsh'
}

export interface ParseOptions {
  dialect?: Dialect
  /** The skill's folder name: Claude Code and Codex use it when `name` is absent. */
  dirName?: string
}

export interface InvocationPolicy {
  modelInvocable: boolean
  userInvocable: boolean
}

/**
 * Loaded, but not the way the author meant: Claude Code ignored a frontmatter that does not
 * parse, or fell back to the body's first line for a missing description.
 */
export type SkillNote = { code: 'frontmatter-ignored'; reason: string } | { code: 'description-from-body' }

export interface ParsedSkill {
  name: string
  description: string
  whenToUse?: string
  invocation: InvocationPolicy
  metadata?: Record<string, unknown>
  body: string
  notes?: SkillNote[]
}

export type DropCode =
  | 'missing-frontmatter'
  | 'invalid-yaml'
  | 'missing-name-or-description'
  | 'invalid-name'
  | 'invalid-invocation'
  | 'reserved-folder'

export type ParseResult =
  | { ok: true; skill: ParsedSkill }
  | { ok: false; code: DropCode; reason: string; rawName?: string }

const LEGACY_KEYS: Array<[string, string]> = [
  ['disableModelInvocation', 'disable-model-invocation'],
  ['modelInvocable', 'disable-model-invocation'],
  ['userInvocable', 'user-invocable'],
]

export function parseSkillText(input: string, options: ParseOptions = {}): ParseResult {
  // A BOM is what Notepad and PowerShell's Out-File write; it is not part of the document.
  const raw = input.replace(/^\ufeff/, '')
  if (options.dialect === 'claude-code') return parseClaudeCode(raw, options.dirName ?? '')
  if (options.dialect === 'codex') return parseCodex(raw, options.dirName ?? '')
  let split: { data: Record<string, unknown>; body: string } | undefined
  try {
    split = splitFrontmatter(raw)
  } catch (error) {
    return { ok: false, code: 'invalid-yaml', reason: t('fm.yaml', firstLine(error)) }
  }
  if (!split) return { ok: false, code: 'missing-frontmatter', reason: t('fm.missing') }
  const { data, body } = split
  const name = stringField(data, 'name')
  const description = stringField(data, 'description')
  const rawName = typeof data.name === 'string' ? data.name : undefined
  if (name === undefined || description === undefined) {
    return { ok: false, code: 'missing-name-or-description', reason: t('fm.required'), rawName }
  }
  if (!SKILL_NAME.test(name)) {
    return { ok: false, code: 'invalid-name', reason: t('fm.badName', name), rawName }
  }
  let invocation: InvocationPolicy
  try {
    invocation = parseInvocationPolicy(data)
  } catch (error) {
    return { ok: false, code: 'invalid-invocation', reason: firstLine(error), rawName }
  }
  const skill: ParsedSkill = { name, description, invocation, body: body.replace(/\r\n/g, '\n').trim() }
  const whenToUse = stringField(data, 'whenToUse')
  if (whenToUse !== undefined) skill.whenToUse = whenToUse
  const metadata = data.metadata
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    skill.metadata = metadata as Record<string, unknown>
  }
  return { ok: true, skill }
}

/** Claude Code: every field is optional, and a frontmatter that doesn't parse is ignored, not fatal. */
function parseClaudeCode(raw: string, dirName: string): ParseResult {
  const block = frontmatterBlock(raw)
  const notes: SkillNote[] = []
  let data: Record<string, unknown> = {}
  let body = raw
  if (block) {
    body = block.body
    try {
      const parsed: unknown = parse(block.yaml)
      if (isMap(parsed)) data = parsed
      else if (parsed !== null && parsed !== undefined) notes.push({ code: 'frontmatter-ignored', reason: t('fm.notMapping') })
    } catch (error) {
      notes.push({ code: 'frontmatter-ignored', reason: t('fm.yaml', firstLine(error)) })
    }
  }
  const name = stringField(data, 'name') ?? dirName
  const rawName = typeof data.name === 'string' ? data.name : undefined
  if (!name || CLAUDE_REFUSED_NAME.test(name) || /^ | $| {2}/.test(name)) {
    return { ok: false, code: 'invalid-name', reason: t('fm.ccBadName', name), rawName }
  }
  if (name === 'anthropic-skills' || name.startsWith('anthropic-skills:')) {
    return { ok: false, code: 'invalid-name', reason: t('fm.reservedName', name), rawName }
  }
  let description = stringField(data, 'description')
  if (description === undefined) {
    description = body.split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? ''
    if (!notes.length) notes.push({ code: 'description-from-body' })
  }
  const skill: ParsedSkill = {
    name,
    description,
    invocation: {
      modelInvocable: lenientBoolean(data['disable-model-invocation']) !== true,
      userInvocable: lenientBoolean(data['user-invocable']) !== false,
    },
    body: body.replace(/\r\n/g, '\n').trim(),
  }
  const whenToUse = stringField(data, 'when_to_use')
  if (whenToUse !== undefined) skill.whenToUse = whenToUse
  if (isMap(data.metadata)) skill.metadata = data.metadata
  if (notes.length) skill.notes = notes
  return { ok: true, skill }
}

/** Control, format (zero-width, bidi), private-use and unassigned characters, blanks other than a plain space, < and >. */
const CLAUDE_REFUSED_NAME = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}<>]|[^\S ]/u

/** Claude Code reads yes/no/on/off/1/0 in any case; anything else leaves the default. */
function lenientBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === 0) return value === 1
  if (typeof value !== 'string') return undefined
  const v = value.toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(v)) return true
  if (['false', 'no', 'off', '0'].includes(v)) return false
  return undefined
}

const CODEX_MAX_NAME = 64

/** Codex: frontmatter and a description are required; the name falls back to the folder. */
function parseCodex(raw: string, dirName: string): ParseResult {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { ok: false, code: 'missing-frontmatter', reason: t('fm.missing') }
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  if (close <= 1) return { ok: false, code: 'missing-frontmatter', reason: t('fm.missing') }
  const yamlText = lines.slice(1, close).join('\n')
  let parsed: unknown
  try {
    parsed = parse(yamlText)
  } catch (error) {
    // Third-party skills write prose like `description: Build for AWS: ECS`; Codex quotes such
    // lines and tries again before giving up.
    const repaired = repairScalarFields(yamlText)
    try {
      if (repaired === undefined) throw error
      parsed = parse(repaired)
    } catch {
      return { ok: false, code: 'invalid-yaml', reason: t('fm.yaml', firstLine(error)) }
    }
  }
  if (!isMap(parsed)) return { ok: false, code: 'invalid-yaml', reason: t('fm.notMapping') }
  // serde rejects a field of the wrong type, which fails the whole file.
  for (const key of ['name', 'description'] as const) {
    const value = parsed[key]
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return { ok: false, code: 'invalid-yaml', reason: t('fm.notString', key) }
    }
  }
  const meta = parsed.metadata
  if (meta !== undefined && meta !== null && (!isMap(meta) || (meta['short-description'] != null && typeof meta['short-description'] !== 'string'))) {
    return { ok: false, code: 'invalid-yaml', reason: t('fm.notString', 'metadata.short-description') }
  }
  const singleLine = (v: unknown) => (typeof v === 'string' ? v.split(/\s+/).filter(Boolean).join(' ') : '')
  const name = singleLine(parsed.name) || dirName
  const rawName = typeof parsed.name === 'string' ? parsed.name : undefined
  if (!name) return { ok: false, code: 'missing-name-or-description', reason: t('fm.noName'), rawName }
  if ([...name].length > CODEX_MAX_NAME) return { ok: false, code: 'invalid-name', reason: t('fm.tooLong', 'name', CODEX_MAX_NAME), rawName }
  const description = singleLine(parsed.description)
  if (!description) return { ok: false, code: 'missing-name-or-description', reason: t('fm.noDescription'), rawName }
  const skill: ParsedSkill = {
    name,
    description,
    invocation: { modelInvocable: true, userInvocable: true },
    body: lines.slice(close + 1).join('\n').trim(),
  }
  if (isMap(meta)) skill.metadata = meta
  return { ok: true, skill }
}

/** Port of codex-rs `repair_frontmatter_scalar_fields`: quote `key: prose: with colons`. */
function repairScalarFields(frontmatter: string): string | undefined {
  let changed = false
  let blockIndent: number | undefined
  const out: string[] = []
  for (const line of frontmatter.split('\n')) {
    const indent = line.length - line.replace(/^ +/, '').length
    if (blockIndent !== undefined) {
      if (line.trim() === '' || indent > blockIndent) {
        out.push(line)
        continue
      }
      blockIndent = undefined
    }
    const colon = line.indexOf(':')
    const key = line.slice(0, colon)
    const value = line.slice(colon + 1)
    if (colon < 0 || key.trim() === '' || (value !== '' && !/^\s/.test(value))) {
      out.push(line)
      continue
    }
    const trimmedStart = value.trimStart()
    const leading = value.slice(0, value.length - trimmedStart.length)
    let scalar = trimmedStart
    let comment = ''
    for (let i = 0; i < trimmedStart.length; i++) {
      if (trimmedStart[i] === '#' && (i === 0 || /\s/.test(trimmedStart[i - 1]!))) {
        const commentStart = trimmedStart.slice(0, i).trimEnd().length
        scalar = trimmedStart.slice(0, commentStart)
        comment = trimmedStart.slice(commentStart)
        break
      }
    }
    scalar = scalar.trimEnd()
    const first = scalar[0]
    if (first === undefined || first === "'" || first === '"') {
      out.push(line)
      continue
    }
    if (first === '|' || first === '>') {
      blockIndent = indent
      out.push(line)
      continue
    }
    const invalidFlow = '[{@`'.includes(first) && !parsesAsYaml(scalar)
    if (!/:\s/.test(scalar) && !invalidFlow) {
      out.push(line)
      continue
    }
    out.push(`${key}:${leading}'${scalar.replaceAll("'", "''")}'${comment}`)
    changed = true
  }
  return changed ? out.join('\n') : undefined
}

function parsesAsYaml(text: string): boolean {
  try {
    parse(text)
    return true
  } catch {
    return false
  }
}

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text between an opening `---` on the first line and the next `---` line, unparsed. */
function frontmatterBlock(raw: string): { yaml: string; body: string } | undefined {
  const firstLineEnd = raw.indexOf('\n')
  if (firstLineEnd < 0) return undefined
  if (raw.slice(0, firstLineEnd).replace(/\r$/, '') !== '---') return undefined
  const start = firstLineEnd + 1
  let lineStart = start
  while (lineStart <= raw.length) {
    const nextNewline = raw.indexOf('\n', lineStart)
    const lineEnd = nextNewline < 0 ? raw.length : nextNewline
    if (raw.slice(lineStart, lineEnd).replace(/\r$/, '') === '---') {
      return { yaml: raw.slice(start, lineStart), body: raw.slice(nextNewline < 0 ? raw.length : nextNewline + 1) }
    }
    if (nextNewline < 0) return undefined
    lineStart = nextNewline + 1
  }
  return undefined
}

export function splitFrontmatter(raw: string): { data: Record<string, unknown>; body: string } | undefined {
  const block = frontmatterBlock(raw)
  if (!block) return undefined
  const parsed: unknown = parse(block.yaml)
  if (!isMap(parsed)) return undefined
  return { data: parsed, body: block.body }
}

function parseInvocationPolicy(data: Record<string, unknown>): InvocationPolicy {
  for (const [legacy, canonical] of LEGACY_KEYS) {
    if (Object.hasOwn(data, legacy)) throw new Error(t('fm.legacyKey', legacy, canonical))
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
  throw new TypeError(t('fm.notBool', key, JSON.stringify(value)))
}

function stringField(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function firstLine(error: unknown): string {
  return (String(error instanceof Error ? error.message : error).split('\n')[0] ?? '').replace(/:\s*$/, '')
}

/** dsh-tool-skill's catalog rendering: whitespace collapsed, cut at maxLength with "...". */
export function catalogDescription(value: string, maxLength: number): string {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  const cut = normalized.slice(0, maxLength - 3)
  // Never leave half a surrogate pair behind: the catalog would render a replacement glyph.
  return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}...`
}
