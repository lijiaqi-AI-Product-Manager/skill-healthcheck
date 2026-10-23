#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { runCheck, scanAndRecord, type CheckOptions } from './check.js'
import { nowMs } from './env.js'
import { isLang, setLang, t } from './i18n.js'
import type { JournalEvent } from './journal.js'
import { c, checkJson, renderCheck, renderDetails, renderInventory, renderJournal, renderWhy } from './report.js'
import { catalogTimeline, loadSessions } from './sessions.js'
import { isSafeGitUrl, matchRepoSkills, parseSourceSpec, resolveProvenance, SOURCES_FILE, UpstreamChecker, type SourcesFile } from './upstream.js'
import { explainWhy, why } from './why.js'

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      all: { type: 'boolean' },
      json: { type: 'boolean' },
      offline: { type: 'boolean' },
      'no-sessions': { type: 'boolean' },
      since: { type: 'string' },
      platform: { type: 'string' },
      profile: { type: 'string' },
      cwd: { type: 'string' },
      name: { type: 'string' },
      repo: { type: 'string' },
      force: { type: 'boolean' },
      lang: { type: 'string' },
      explain: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })
  if (values.lang !== undefined && !isLang(values.lang)) {
    setLang()
    throw new UsageError(t('cli.unknownLang', values.lang))
  }
  setLang(values.lang)
  if (values.help) {
    console.log(t('cli.help'))
    return 0
  }
  if (values.version) {
    console.log(readVersion())
    return 0
  }
  const platform = values.platform
  if (platform !== undefined && platform !== 'dsh' && platform !== 'generic') throw new UsageError(t('cli.unknownPlatform', platform))
  const options: CheckOptions = {
    cwd: values.cwd,
    platform,
    profile: values.profile,
    offline: values.offline,
    sessions: !values['no-sessions'],
  }
  const since = values.since ? parseDate(values.since) : undefined
  const [command = 'check', ...rest] = positionals

  switch (command) {
    case 'check': {
      const result = await runCheck({ ...options, explain: values.explain, onProgress: values.json ? undefined : progress })
      if (values.json) console.log(JSON.stringify(checkJson(result), null, 2))
      else {
        console.log(renderCheck(result, { all: values.all }))
        if (values.all) console.log(`\n${renderDetails(result)}`)
        if (result.newEvents.some((e) => e.kind === 'baseline')) console.log(c.dim(t('r.recordingStarted', result.newEvents.length)))
      }
      const bad =
        result.verdicts.some((v) => v.state === 'broken') ||
        result.orphanFindings.some((f) => f.severity === 'critical' || f.severity === 'high') ||
        result.pluginFindings.some((f) => f.severity === 'critical')
      return bad ? 1 : 0
    }
    case 'ls': {
      const { store, platform: info, inventory } = scanAndRecord(options)
      // Skills the model was shown that don't exist on disk come from plugins (runtime providers).
      const sessions = options.sessions === false ? [] : loadSessions(info.sessionSources, store)
      const onDisk = new Set([...inventory.active, ...inventory.shadowed].map((s) => s.skill.name))
      const latest = sessions.flatMap((s) => s.catalogs).sort((a, b) => b.t - a.t)[0]
      const runtime = (latest?.entries ?? []).map((e) => e.name).filter((n) => !onDisk.has(n))
      if (values.json) {
        console.log(
          JSON.stringify(
            {
              active: inventory.active.map((s) => ({ name: s.skill.name, source: s.root.source, file: s.file })),
              shadowed: inventory.shadowed.map((s) => ({ name: s.skill.name, file: s.file, by: s.shadowedBy?.file })),
              dropped: inventory.dropped.map((d) => ({ file: d.file, reason: d.parse.ok ? '' : d.parse.reason })),
              nested: inventory.nested.map((n) => ({ dir: n.dir, found: n.found })),
              runtime,
            },
            null,
            2,
          ),
        )
      } else console.log(renderInventory(inventory, runtime, { all: values.all }))
      return 0
    }
    case 'log': {
      const { store } = scanAndRecord(options)
      let events: JournalEvent[] = store.readJournal()
      if (since !== undefined) events = events.filter((e) => e.t >= since)
      if (values.name) events = events.filter((e) => e.name === values.name)
      if (!values.all) events = events.filter((e) => e.kind !== 'baseline' || events.length < 40)
      console.log(values.json ? JSON.stringify(events, null, 2) : renderJournal(events))
      return 0
    }
    case 'why': {
      const symptom = rest.join(' ').trim() || undefined
      if (!symptom && since === undefined) throw new UsageError(t('cli.whyUsage'))
      const { store, platform: info, inventory } = scanAndRecord(options)
      const sessions = options.sessions === false ? [] : loadSessions(info.sessionSources, store)
      const result = why({ symptom, since, inventory, journal: store.readJournal(), store, sessions, timeline: catalogTimeline(sessions) })
      if (values.explain && !values.offline) {
        progress(t('progress.explain', 1))
        await explainWhy(result, symptom ?? '', true, store)
        progress('')
      }
      console.log(values.json ? JSON.stringify(result, null, 2) : renderWhy(result, symptom))
      return 0
    }
    case 'adopt': {
      if (values.repo) return adoptRepo(values.repo, options, values.force === true)
      const [name, spec] = rest
      if (!name || !spec) throw new UsageError(t('cli.adoptUsage'))
      const parsed = parseSourceSpec(spec)
      if (!parsed || !isSafeGitUrl(parsed.url)) throw new UsageError(t('cli.badSource', spec))
      const { store, inventory } = scanAndRecord(options)
      if (!inventory.active.some((s) => s.skill.name === name)) throw new UsageError(t('cli.noSuchSkill', name))
      const sources = store.readJsonFile<SourcesFile>(SOURCES_FILE) ?? {}
      sources[name] = { ...parsed, adoptedAt: nowMs() }
      store.writeJsonFile(SOURCES_FILE, sources)
      console.log(t('cli.adopted', name, `${parsed.url}${parsed.subpath ? `#${parsed.subpath}` : ''}${parsed.ref ? `@${parsed.ref}` : ''}`))
      return 0
    }
    case 'record': {
      const { newEvents } = scanAndRecord(options)
      if (values.json) console.log(JSON.stringify(newEvents))
      return 0
    }
    default:
      throw new UsageError(`${t('cli.unknownCommand', command)}\n\n${t('cli.help')}`)
  }
}

async function adoptRepo(spec: string, options: CheckOptions, force: boolean): Promise<number> {
  const parsed = parseSourceSpec(spec)
  if (!parsed || !isSafeGitUrl(parsed.url)) throw new UsageError(t('cli.badSource', spec))
  const { store, platform, inventory } = scanAndRecord(options)
  const sources = store.readJsonFile<SourcesFile>(SOURCES_FILE) ?? {}
  // Only skills we can't already trace, unless --force.
  const candidates = []
  for (const s of inventory.active) {
    if (s.root.bundled) continue
    if (!force && (sources[s.skill.name] || (await resolveProvenance(s, platform, {})).kind === 'git')) continue
    candidates.push(s)
  }
  if (candidates.length === 0) {
    console.log(t('cli.nothingToAdopt'))
    return 0
  }
  const checker = new UpstreamChecker(store, { onFetch: (url) => progress(t('cli.fetching', url)) })
  const result = await matchRepoSkills(checker, parsed, candidates)
  progress('')
  if (!result.ok) {
    const r = result.result
    throw new UsageError(t('cli.repoUnreadable', 'detail' in r ? r.detail : r.state))
  }
  for (const m of result.matches) {
    sources[m.skill.skill.name] = { url: parsed.url, subpath: m.subpath, ref: parsed.ref, adoptedAt: nowMs() }
    const how = m.by === 'name' ? t('cli.byName') : t('cli.byContent', Math.round(m.score * 100))
    console.log(`${t('cli.adopted', m.skill.skill.name.padEnd(24), m.subpath || '/')}  ${c.dim(how)}`)
  }
  if (result.matches.length) store.writeJsonFile(SOURCES_FILE, sources)
  console.log(c.dim(t('cli.adoptSummary', result.repoSkills, result.matches.length, candidates.length - result.matches.length)))
  return 0
}

/** One rewritable status line on stderr; silent when stderr isn't a terminal. */
function progress(text: string) {
  if (!process.stderr.isTTY) return
  process.stderr.write(`\r\x1b[2K${text ? c.dim(text) : ''}`)
}

class UsageError extends Error {}

function parseDate(s: string): number {
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
  if (Number.isNaN(time)) throw new UsageError(t('cli.badDate', s))
  return time
}

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    if (error instanceof UsageError || (error as { code?: string })?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      console.error(error.message)
      process.exit(2)
    }
    console.error(error)
    process.exit(2)
  },
)
