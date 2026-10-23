import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface Symptom {
  id: string
  title_zh: string
  user_phrases: string[]
  skill_signals: { phrases: string[]; regex: string[] }
  explain_zh: string
}

export interface PlatformToken {
  id: string
  regex: string
  only_on: Array<'windows' | 'macos' | 'linux' | 'posix'>
  kind: string
  example: string
  explain_zh: string
}

export interface Lexicon {
  version: number
  symptoms: Symptom[]
  platform_tokens: PlatformToken[]
}

let cached: Lexicon | undefined

export function loadLexicon(): Lexicon {
  if (cached) return cached
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/lexicon.json after build; src/lexicon.json when running from source (tests).
  for (const file of [join(here, 'lexicon.json'), join(here, '..', 'src', 'lexicon.json')]) {
    try {
      cached = JSON.parse(readFileSync(file, 'utf8')) as Lexicon
      return cached
    } catch {
      // try next
    }
  }
  throw new Error('lexicon.json not found')
}

export type OsName = 'windows' | 'macos' | 'linux'

export function currentOs(platform: NodeJS.Platform = process.platform): OsName {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return 'linux'
}

export function tokenSupports(token: PlatformToken, os: OsName): boolean {
  return token.only_on.some((p) => p === os || (p === 'posix' && os !== 'windows'))
}

/** Lexicon signal phrases/regexes (from any symptom) found in text. */
export function signalHits(text: string, symptoms: Symptom[] = loadLexicon().symptoms): Array<{ symptom: Symptom; hit: string }> {
  const lower = text.toLowerCase()
  const out: Array<{ symptom: Symptom; hit: string }> = []
  for (const symptom of symptoms) {
    for (const phrase of symptom.skill_signals.phrases) {
      if (phrase && lower.includes(phrase.toLowerCase())) out.push({ symptom, hit: phrase })
    }
    for (const source of symptom.skill_signals.regex) {
      try {
        const m = new RegExp(source, 'i').exec(text)
        if (m) out.push({ symptom, hit: m[0] })
      } catch {
        // a bad regex in a user-supplied lexicon shouldn't break the run
      }
    }
  }
  return out
}
