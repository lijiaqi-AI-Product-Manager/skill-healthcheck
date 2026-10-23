#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { runCheck, scanAndRecord, type CheckOptions } from './check.js'
import { nowMs } from './env.js'
import { installOutputTranslation, setLang } from './i18n.js'
import type { JournalEvent } from './journal.js'
import { c, checkJson, renderCheck, renderDetails, renderInventory, renderJournal, renderWhy } from './report.js'
import { catalogTimeline, loadSessions } from './sessions.js'
import { isSafeGitUrl, matchRepoSkills, parseSourceSpec, resolveProvenance, SOURCES_FILE, UpstreamChecker, type SourcesFile } from './upstream.js'
import { why } from './why.js'

const HELP = `skill-healthcheck — 我装的技能现在还有用吗？没用的是哪个、从什么时候开始？

用法
  skill-healthcheck [check]          一屏体检：宿主、插件、技能
  skill-healthcheck why "<现象>"     按时间线反查可疑技能，例如 why "不用中文回答了"
  skill-healthcheck log              看记录：装了什么、改了什么、什么时候
  skill-healthcheck ls               列出平台实际会加载的技能（含被遮蔽/被丢弃的）
  skill-healthcheck adopt --repo <仓库>
                                     批量登记：把本地技能和仓库里的技能按名字/内容对上，例如 --repo github:anthropics/skills
  skill-healthcheck adopt <name> <来源>
                                     登记单个技能来源：github:owner/repo/path、GitHub 链接或 <git-url>#<path>
  skill-healthcheck record           只记录一次快照，不输出（给钩子/定时任务用）

选项
  --all            展开所有条目和详情
  --json           机器可读输出
  --offline        不联网（不查上游、不查 npm）
  --no-sessions    不读会话日志
  --since <日期>   log/why 的起始时间，如 2026-10-01
  --platform <dsh|generic>   默认自动识别
  --profile <名字> dsh profile，默认 desktop
  --cwd <目录>     以哪个项目目录为准（影响项目级技能）

它只读你的技能和配置，从不修改、从不自动更新。记录保存在 ~/.skill-healthcheck/。`

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
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })
  setLang(values.lang as string | undefined)
  installOutputTranslation()
  if (values.help) {
    console.log(HELP)
    return 0
  }
  if (values.version) {
    console.log(readVersion())
    return 0
  }
  const platform = values.platform as CheckOptions['platform']
  if (platform && platform !== 'dsh' && platform !== 'generic') throw new UsageError(`未知平台：${platform}`)
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
      const result = await runCheck({ ...options, onProgress: values.json ? undefined : progress })
      if (values.json) console.log(JSON.stringify(checkJson(result), null, 2))
      else {
        console.log(renderCheck(result, { all: values.all }))
        if (values.all) console.log(`\n${renderDetails(result)}`)
        if (result.newEvents.some((e) => e.kind === 'baseline')) console.log(c.dim(`已开始记录（${result.newEvents.length} 条）。以后每次运行都会记下变化。`))
      }
      const bad =
        result.verdicts.some((v) => v.state === 'broken') ||
        result.orphanFindings.some((f) => f.severity === 'critical' || f.severity === 'high') ||
        result.pluginFindings.some((f) => f.severity === 'critical')
      return bad ? 1 : 0
    }
    case 'ls': {
      const { inventory } = scanAndRecord(options)
      if (values.json) {
        console.log(JSON.stringify({ active: inventory.active.map((s) => ({ name: s.skill.name, source: s.root.source, file: s.file })), shadowed: inventory.shadowed.map((s) => ({ name: s.skill.name, file: s.file, by: s.shadowedBy?.file })), dropped: inventory.dropped.map((d) => ({ file: d.file, reason: d.parse.ok ? '' : d.parse.reason })) }, null, 2))
      } else console.log(renderInventory(inventory))
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
      if (!symptom && since === undefined) throw new UsageError('用法：skill-healthcheck why "<现象>" 或 --since <日期>')
      const { store, platform: info, inventory } = scanAndRecord(options)
      const sessions = options.sessions === false ? [] : loadSessions(info.sessionsDir, store)
      const result = why({ symptom, since, inventory, journal: store.readJournal(), store, sessions, timeline: catalogTimeline(sessions) })
      console.log(values.json ? JSON.stringify(result, null, 2) : renderWhy(result, symptom))
      return 0
    }
    case 'adopt': {
      if (values.repo) return adoptRepo(values.repo, options, values.force === true)
      const [name, spec] = rest
      if (!name || !spec) throw new UsageError('用法：skill-healthcheck adopt <name> <来源>  或  skill-healthcheck adopt --repo <仓库>')
      const parsed = parseSourceSpec(spec)
      if (!parsed) throw new UsageError(`看不懂的来源：${spec}`)
      if (!isSafeGitUrl(parsed.url)) throw new UsageError(`不支持的来源地址：${parsed.url}`)
      const { store, inventory } = scanAndRecord(options)
      if (!inventory.active.some((s) => s.skill.name === name)) throw new UsageError(`没有找到生效中的技能 ${name}（skill-healthcheck ls 查看）`)
      const sources = store.readJsonFile<SourcesFile>(SOURCES_FILE) ?? {}
      sources[name] = { ...parsed, adoptedAt: nowMs() }
      store.writeJsonFile(SOURCES_FILE, sources)
      console.log(`已登记：${name} ← ${parsed.url}${parsed.subpath ? `#${parsed.subpath}` : ''}${parsed.ref ? `@${parsed.ref}` : ''}`)
      return 0
    }
    case 'record': {
      const { newEvents } = scanAndRecord(options)
      if (values.json) console.log(JSON.stringify(newEvents))
      return 0
    }
    default:
      throw new UsageError(`未知命令：${command}\n\n${HELP}`)
  }
}

async function adoptRepo(spec: string, options: CheckOptions, force: boolean): Promise<number> {
  const parsed = parseSourceSpec(spec)
  if (!parsed || !isSafeGitUrl(parsed.url)) throw new UsageError(`不支持的来源地址：${spec}`)
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
    console.log('没有需要登记来源的技能（已有来源的用 --force 覆盖）。')
    return 0
  }
  const checker = new UpstreamChecker(store, { onFetch: (url) => progress(`正在获取 ${url} …`) })
  const result = await matchRepoSkills(checker, parsed, candidates)
  progress('')
  if (!result.ok) {
    const r = result.result
    throw new UsageError(`无法读取仓库：${'detail' in r ? r.detail : r.state}`)
  }
  for (const m of result.matches) {
    sources[m.skill.skill.name] = { url: parsed.url, subpath: m.subpath, ref: parsed.ref, adoptedAt: nowMs() }
    const how = m.by === 'name' ? '同名' : `内容相似 ${Math.round(m.score * 100)}%`
    console.log(`已登记：${m.skill.skill.name.padEnd(24)} ← ${m.subpath || '/'}  ${c.dim(how)}`)
  }
  if (result.matches.length) store.writeJsonFile(SOURCES_FILE, sources)
  const missed = candidates.length - result.matches.length
  console.log(c.dim(`仓库里有 ${result.repoSkills} 个技能；登记 ${result.matches.length} 个${missed ? `，${missed} 个本地技能在这个仓库里没找到` : ''}。`))
  return 0
}

/** One rewritable status line on stderr; silent when stderr isn't a terminal. */
export function progress(text: string) {
  if (!process.stderr.isTTY) return
  process.stderr.write(`\r\x1b[2K${text ? c.dim(text) : ''}`)
}

class UsageError extends Error {}

function parseDate(s: string): number {
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
  if (Number.isNaN(t)) throw new UsageError(`看不懂的日期：${s}`)
  return t
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
