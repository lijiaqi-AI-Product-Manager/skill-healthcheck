// Every user-facing sentence lives here, once per language. Code calls t('key', ...args)
// at the place the text is produced, so user data (skill names, descriptions) is never
// run through a translator, and --json carries the same language as the screen.
//
// `en` is typed as `typeof zh`: a missing key or a wrong parameter list is a compile error.

export type Lang = 'zh' | 'en'

const zh = {
  // frontmatter (why a skill gets dropped)
  'fm.yaml': (e: string) => `YAML 解析失败：${e}`,
  'fm.missing': () => '缺少 YAML frontmatter（文件必须以 --- 开头）',
  'fm.required': () => 'frontmatter 必须同时有 name 和 description',
  'fm.badName': (name: string) => `name "${name}" 不是 kebab-case（只允许小写字母、数字和单个连字符）`,
  'fm.legacyKey': (legacy: string, canonical: string) => `字段 "${legacy}" 已不支持，应改为 "${canonical}"`,
  'fm.notBool': (key: string, value: string) => `字段 "${key}" 必须是布尔值，当前是 ${value}`,
  'fm.notMapping': () => 'frontmatter 不是 "键: 值" 的映射',
  'fm.notString': (key: string) => `字段 "${key}" 必须是字符串`,
  'fm.ccBadName': (name: string) => `name "${name}" 含有 Claude Code 拒收的字符（控制符、零宽字符、方向控制符、< >、连续空格等）`,
  'fm.reservedName': (name: string) => `name "${name}" 是保留名，只有插件里能用`,
  'fm.noName': () => '没有 name，文件夹名也取不到',
  'fm.noDescription': () => '缺少 description（Codex 要求必填）',
  'fm.tooLong': (key: string, max: number) => `${key} 超过 ${max} 个字符`,

  // local checks
  'local.dropped': (who: string, reason: string) => `${who} 会静默丢弃它：${reason}`,
  'local.shadowedSame': (source: string) => `与 ${source} 中的同名副本重复（内容相同）`,
  'local.shadowed': (source: string) => `被 ${source} 里的同名技能遮蔽，这份永远不会生效`,
  'local.conflict': (source: string, agent: string) => `和 ${source} 里的技能同名，${agent} 只会加载其中一份，留一份即可`,
  'local.listedTwice': (source: string, agent: string) => `和 ${source} 里的技能同名，${agent} 会把两份都列给模型，触发时可能选错，留一份即可`,
  'local.frontmatterIgnored': (reason: string) => `frontmatter 写坏了，Claude Code 忽略全部字段：模型看不到你的 description，只能手动 /名字 调用（${reason}）`,
  'local.descriptionFromBody': (line: string) => `没有 description，Claude Code 拿正文第一行代替：“${line}”`,
  'local.reservedFolder': (name: string) => `文件夹名 "${name}" 是 Claude Code 保留给 claude.ai 同步的，这里的技能会被跳过`,
  'local.active': (file: string) => `生效：${file}`,
  'local.loser': (file: string) => `被遮蔽：${file}`,
  'local.nested': (n: number) => `目录里有 ${n} 个技能嵌套太深，只认 <根>/<名>/SKILL.md`,
  'local.nestedDeep': (n: number, depth: number) => `目录里有 ${n} 个技能嵌套太深，Codex 只往下找 ${depth} 层`,
  'local.unscanned': (path: string, n: number) => `${path} 不在扫描范围内，这里的 ${n} 个技能都不会加载`,
  'local.truncated': (max: number) => `description 超过 ${max} 字符，目录里被截断，结尾的触发词模型看不到`,
  'local.shownTo': (tail: string) => `显示到：…${tail}`,
  'local.manualOnly': (name: string) => `disable-model-invocation: true，只能手动 /${name}`,
  'usage.quietAfterChange': (calls: number, day: string) => `调用 ${calls} 次后，自 ${day} description 改动起 0 次`,
  'usage.quiet': (calls: number, day: string) => `曾被调用 ${calls} 次，${day} 后再没被用过`,
  'usage.lastCall': (day: string, n: number) => `最后一次调用：${day}，之后 ${n} 个会话目录里都有它却没用过`,
  'usage.descChangedOn': (day: string) => `${day} 模型看到的 description 变了`,

  // upstream
  'up.offline': () => '离线模式，未检查',
  'up.localMissing': (path: string) => `来源路径不存在：${path}（检查这个技能的 metadata.source）`,
  'up.suspicious': (url: string) => `拒绝使用可疑的来源地址：${url}`,
  'up.gh404': () => 'GitHub 返回 404（已删除或已转为私有）',
  'up.ghUnknown': (detail: string) => `${detail}；GitHub API 也无法确认`,
  'up.unreachable': (detail: string) => `上游暂时无法检查：${detail}`,
  'up.repoMissing': (detail: string) => `上游仓库已不存在（${detail}），本地副本已无人维护`,
  'up.repoMoved': (url: string) => `上游仓库已迁移到 ${url}`,
  'up.adoptHint': () => '用 skill-healthcheck adopt 更新来源',
  'up.removed': (date?: string) => `上游已删除这个技能${date ? `（${date}）` : ''}，本地副本已无人维护`,
  'up.deletedIn': (sha: string) => `删除提交：${sha}`,
  'up.minor': () => '上游有小改动（不影响触发）',
  'up.updatedOn': (date: string) => `上游 ${date} 更新`,
  'up.updated': () => '上游有更新',
  'up.localModified': () => '；你本地也改过这个文件',

  // impact
  'impact.invalid': (reason: string) => `上游新版本会被静默丢弃：${reason}`,
  'impact.renamed': (to: string, from: string) => `上游改名为 ${to} → 你的 /${from} 会失效`,
  'impact.newEntry': (name: string) => `新入口：/${name}`,
  'impact.modelDisabled': () => '上游加了 disable-model-invocation，模型将不再自动使用它',
  'impact.userDisabled': (name: string) => `上游加了 user-invocable: false，/${name} 会失效`,
  'impact.descChanged': (parts: string) => `上游改了 description：${parts}`,
  'impact.descExpanded': (parts: string) => `上游扩写了 description：${parts}`,
  'impact.wording': () => '措辞调整',
  'impact.removedWords': (words: string) => `删去 ${words}`,
  'impact.addedWords': (words: string) => `新增 ${words}`,
  'impact.join': () => '，',
  'impact.was': (text: string) => `旧：${text}`,
  'impact.now': (text: string) => `新：${text}`,
  'impact.newSignal': (hit: string, title: string) => `新增"${hit}"（${title}）`,
  'impact.truncated': (len: number, max: number) => `description 变为 ${len} 字符，超过 ${max} 会被截断`,
  'impact.hiddenTail': (tail: string) => `模型看不到的结尾：…${tail}`,
  'impact.catalogShows': (text: string) => `目录中显示：${text}`,
  'impact.descGrew': (n: number) => `description 变长 ${n} 字符，每轮都多占目录上下文`,
  'impact.scriptsAdded': (n: number) => `新增 ${n} 个脚本，需人工审代码后再用`,
  'impact.foreignScripts': (files: string) => `其中 ${files} 在当前系统上可能跑不起来`,
  'impact.scriptsChanged': (n: number) => `${n} 个脚本内容有改动，需复核`,
  'impact.bodyGrew': (chars: string, tokens: number) => `正文 +${chars}（每次调用约 +${tokens} token）`,
  'impact.chars': (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k 字符` : `${n} 字符`),
  'impact.platform': (labels: string, os: string) => `新增了 ${labels} 专用写法，在你的 ${os} 上可能失效`,
  'impact.moved': (path: string) => `上游把技能移到了 ${path}`,

  // plugins
  'plugin.notInstalled': () => '已声明但 node_modules 里没有，宿主会拒绝加载',
  'plugin.requires': (unmet: string, host: string) => `要求 ${unmet}，当前 dsh ${host}`,
  'plugin.exempt': (host: string) => `与 dsh ${host} 不兼容，靠版本豁免运行`,
  'plugin.deprecated': (msg: string) => `已被作者弃用：${msg}`,
  'plugin.stale': () => '超过一年没有发布新版本，且与当前 dsh 不兼容',
  'plugin.latestIncompatible': (latest: string, req: string) => `${latest} 也不兼容当前 dsh（${req}）`,
  'plugin.broken': () => '失效',

  // check report
  'r.header': (label: string, profile: string, when: string) => `skill-healthcheck · ${label}${profile} · ${when}`,
  'r.profile': (name: string) => ` · profile ${name}`,
  'r.host': () => '宿主',
  'r.plugins': () => '插件',
  'r.skills': () => '技能',
  'r.pluginCounts': (total: number, ok: number, up: string, broken: string) => `${total}：${ok} 正常 · ${up} 可升级 · ${broken} 失效`,
  'r.offlinePlugins': () => '（离线，未查新版本）',
  'r.bundles': (n: number) => `  另有组合包 ${n} 个`,
  'r.noProfile': () => '读不到 profile，跳过',
  'r.skillCounts': (total: number, ok: number, up: string, broken: string) => `${total}：${ok} 正常 · ${up} 有更新 · ${broken} 失效`,
  'r.unchecked': (n: number) => `（其中 ${n} 个没查上游）`,
  'r.bundled': (n: number) => `  （含内置 ${n}）`,
  'r.critical': () => '  ⚠最高危',
  'r.high': () => '  高危',
  'r.evidence': (name: string, msg: string) => `证据：${name} ${msg}`,
  'r.unknownSources': (n: number) => `来源未知 ${n} 个，没查上游。从 git 仓库装的：skill-healthcheck adopt --repo <仓库>；自己写的不用管`,
  'r.more': (n: number) => `…另 ${n} 项（skill-healthcheck --all）`,
  'r.allGood': () => '结论：都还在正常工作，没有需要你处理的',
  'r.summary': (parts: string) => `结论：${parts}`,
  'r.summaryJoin': () => '；',
  'r.upgradable': (n: number) => `插件 ${n} 个可一键升级`,
  'r.needReview': (n: number) => `技能 ${n} 个需你逐个确认`,
  'r.recordingStarted': (n: number) => `已开始记录（${n} 条）。以后每次运行都会记下变化。`,
  'r.journalOff': (error: string) => `写不进记录目录（${error}）；这次的结果仍然有效，但历史不会更新。`,
  'r.hostGeneric': () => '通用模式',
  'r.hostGenericDetail': () => '检查 Claude Code 和 Codex 的技能',
  'r.genericLabel': () => '通用 Agent Skills',
  'host.noProfile': () => '找不到 profile 目录',
  'host.badPackage': (file: string) => `profile 的 package.json 无法解析：${file}`,
  'host.noVersion': () => '读不到 dsh 运行时版本',

  // ls
  'ls.header': (label: string, root: string) => `${label} · 项目根 ${root}`,
  'ls.manual': () => '  (仅手动)',
  'ls.shadowed': (source: string, by: string) => `${source}，被 ${by} 遮蔽`,
  'ls.nested': (n: number) => `嵌套 ${n} 个技能，不会被发现`,
  'ls.unscanned': (path: string, n: number) => `不在扫描范围内（${n} 个）`,
  'ls.runtime': (n: number) => `另有 ${n} 个技能不在这些目录里，由插件或宿主内置提供（来自会话日志里的技能目录）：`,

  // log
  'log.empty': () => '还没有记录。',
  'log.kind.baseline': () => '已存在',
  'log.kind.added': () => '新装',
  'log.kind.changed': () => '变更',
  'log.kind.removed': () => '删除',
  'log.kind.moved': () => '移动',
  'log.kind.status': () => '状态',
  'log.kind.adopted': () => '登记来源',
  'log.kind.upstream-changed': () => '上游变更',
  'log.nameChanged': (from: string, to: string) => `name ${from} → ${to}`,
  'log.descChanged': () => 'description 变了',
  'log.invocation': () => '调用策略变了',
  'log.body': (delta: string) => `正文 ${delta} 字符`,
  'log.scriptsAdded': (files: string) => `新增脚本 ${files}`,
  'log.scriptsChanged': (files: string) => `脚本改动 ${files}`,
  'log.join': () => '；',
  'journal.baselineNote': () => '首次记录时已存在，时间取自文件时间',
  'journal.removedNote': () => '删除时间介于上次记录和本次之间',

  // why
  'why.title': (symptom: string, topic: string) => `why${symptom} → ${topic}`,
  'why.noSymptom': () => '未匹配到已知症状，按时间列出变更',
  'why.topicJoin': () => '、',
  'why.onset': (evidence: string) => `现象起点：${evidence}`,
  'why.languageOnset': (day: string, before: string, that: string) => `助手回复的中文占比：${day} 之前约 ${before}，当天 ${that}（你仍在用中文提问）`,
  'why.since': (day: string) => `从 ${day} 前后开始查`,
  'why.none': () => '没找到可疑项。记录可能还太少，或者原因不在技能里。',
  'why.footer': () => '这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。',
  'why.catalogChanged': (day: string) => `${day} 起模型看到的 description 变了`,
  'why.added': (hit: string) => `新增"${hit}"`,
  'why.lost': (hit: string) => `不再有"${hit}"`,
  'why.removedWords': (words: string) => `删去 ${words}`,
  'why.addedWords': (words: string) => `新增 ${words}`,
  'why.estimated': () => '（按文件时间估计）',
  'why.verb.added': () => '安装',
  'why.verb.changed': () => '内容变更',
  'why.verb.baseline': () => '已安装（首次记录时）',
  'why.verb.moved': () => '移动',
  'why.contains': (hit: string) => `内容含"${hit}"`,
  'why.activeMatch': () => '当前生效，内容含相关规则',
  'why.quiet': (day: string) => `${day} 后再没被调用`,
  'why.quietEvidence': (calls: number, n: number) => `共调用 ${calls} 次，之后 ${n} 个会话 0 次`,

  // cli
  'cli.help': () => `skill-healthcheck — 我装的技能现在还有用吗？没用的是哪个、从什么时候开始？

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
  --name <技能名>  只在 log 里看这一个技能
  --lang <zh|en>   输出语言，默认跟随系统
  --explain        用大模型把上游改动翻成一句人话（可选；需要 ANTHROPIC_API_KEY、DEEPSEEK_API_KEY
                   或 SKILL_HEALTHCHECK_LLM_BASE_URL；只发送技能文本，不发送会话日志）
  --platform <dsh|generic>   默认自动识别
  --profile <名字> dsh profile，默认 desktop
  --cwd <目录>     以哪个项目目录为准（影响项目级技能）
  --force          覆盖已登记的来源（配合 adopt --repo）

退出码：0 正常，1 有失效项，2 用法错误，3 工具自身出错。
它只读你的技能和配置，从不修改、从不自动更新。记录保存在 ~/.skill-healthcheck/。`,
  'cli.unknownPlatform': (p: string) => `未知平台：${p}`,
  'cli.unknownLang': (l: string) => `不支持的语言：${l}（可选 zh、en）`,
  'cli.unknownCommand': (cmd: string) => `未知命令：${cmd}`,
  'cli.whyUsage': () => '用法：skill-healthcheck why "<现象>" 或 --since <日期>',
  'cli.adoptUsage': () => '用法：skill-healthcheck adopt <name> <来源>  或  skill-healthcheck adopt --repo <仓库>',
  'cli.badSource': (spec: string) => `不支持的来源地址：${spec}`,
  'cli.noSuchSkill': (name: string) => `没有找到生效中的技能 ${name}（skill-healthcheck ls 查看）`,
  'cli.adopted': (name: string, where: string) => `已登记：${name} ← ${where}`,
  'cli.nothingToAdopt': () => '没有需要登记来源的技能（已有来源的用 --force 覆盖）。',
  'cli.fetching': (url: string) => `正在获取 ${url} …`,
  'cli.repoUnreadable': (detail: string) => `无法读取仓库：${detail}`,
  'cli.byName': () => '同名',
  'cli.byContent': (pct: number) => `内容相似 ${pct}%`,
  'cli.adoptSummary': (total: number, matched: number, missed: number) =>
    `仓库里有 ${total} 个技能；登记 ${matched} 个${missed ? `，${missed} 个本地技能在这个仓库里没找到` : ''}。`,
  'cli.repoTruncated': () => '仓库里的 SKILL.md 超过 5000 个，只扫描了前 5000 个。',
  'cli.badDate': (s: string) => `看不懂的日期：${s}`,
  'cli.nodeOld': (v: string) =>
    `需要 Node.js 22.19 或更新版本（当前 ${v}）。dsh 的压缩会话日志用到 zstd，旧版本启动时会直接报错。\n升级 Node 后重试：nvm install 22 && nvm use 22`,
  'progress.upstream': (n: number, url: string) => `正在检查上游（第 ${n} 个仓库）：${url}`,
  'progress.plugins': () => '正在检查插件版本…',

  'plugin.command': () => '技能体检：哪些技能悄悄失效了、从什么时候开始（why <现象> 反查原因）',
  'explain.line': (text: string) => `↳ 解读：${text}`,
  'explain.none': () => '--explain：没有配置大模型（设置 ANTHROPIC_API_KEY、DEEPSEEK_API_KEY 或 SKILL_HEALTHCHECK_LLM_BASE_URL），已跳过',
  'explain.via': (provider: string, model: string) => `解读由 ${provider}（${model}）生成，仅供参考；体检结论不依赖它`,
  'progress.explain': (n: number) => `正在生成解读（${n}）…`,

  // labels
  'os.windows': () => 'Windows',
  'os.macos': () => 'macOS',
  'os.linux': () => 'Linux',
  'os.posix': () => 'macOS/Linux',
}

type Catalog = typeof zh

const en: Catalog = {
  'fm.yaml': (e) => `invalid YAML: ${e}`,
  'fm.missing': () => 'no YAML frontmatter (the file must start with ---)',
  'fm.required': () => 'frontmatter needs both name and description',
  'fm.badName': (name) => `name "${name}" is not kebab-case (lowercase letters, digits and single hyphens only)`,
  'fm.legacyKey': (legacy, canonical) => `field "${legacy}" is no longer supported; use "${canonical}"`,
  'fm.notBool': (key, value) => `field "${key}" must be a boolean, got ${value}`,
  'fm.notMapping': () => 'the frontmatter is not a "key: value" mapping',
  'fm.notString': (key) => `field "${key}" must be a string`,
  'fm.ccBadName': (name) => `name "${name}" holds characters Claude Code refuses (control, zero-width or bidi characters, < >, repeated spaces)`,
  'fm.reservedName': (name) => `name "${name}" is reserved for plugins`,
  'fm.noName': () => 'no name, and no folder name to fall back on',
  'fm.noDescription': () => 'no description (Codex requires one)',
  'fm.tooLong': (key, max) => `${key} is longer than ${max} characters`,

  'local.dropped': (who, reason) => `${who} silently drops it: ${reason}`,
  'local.shadowedSame': (source) => `duplicate of a same-name copy in ${source} (identical content)`,
  'local.shadowed': (source) => `shadowed by a same-name skill in ${source}; this copy never takes effect`,
  'local.conflict': (source, agent) => `same name as a skill in ${source}; ${agent} loads only one of them, keep one`,
  'local.listedTwice': (source, agent) => `same name as a skill in ${source}; ${agent} lists both to the model, which may pick the wrong one; keep one`,
  'local.frontmatterIgnored': (reason) => `broken frontmatter: Claude Code ignores every field, so the model never sees your description and only /name works (${reason})`,
  'local.descriptionFromBody': (line) => `no description; Claude Code uses the body's first line instead: "${line}"`,
  'local.reservedFolder': (name) => `folder name "${name}" is reserved for claude.ai sync; Claude Code skips the skill in it`,
  'local.active': (file) => `active: ${file}`,
  'local.loser': (file) => `shadowed: ${file}`,
  'local.nested': (n) => `${n} ${n === 1 ? 'skill' : 'skills'} nested too deep in this folder; only <root>/<name>/SKILL.md is discovered`,
  'local.nestedDeep': (n, depth) => `${n} ${n === 1 ? 'skill' : 'skills'} nested too deep in this folder; Codex looks only ${depth} levels down`,
  'local.unscanned': (path, n) => `${path} is not scanned; ${n === 1 ? 'its one skill never loads' : `its ${n} skills never load`}`,
  'local.truncated': (max) => `description is over ${max} characters and gets truncated in the catalog; the model never sees the trigger words at the end`,
  'local.shownTo': (tail) => `shown up to: …${tail}`,
  'local.manualOnly': (name) => `disable-model-invocation: true, only usable as /${name}`,
  'usage.quietAfterChange': (calls, day) => `called ${calls} times, then 0 since its description changed on ${day}`,
  'usage.quiet': (calls, day) => `called ${calls} times, never used after ${day}`,
  'usage.lastCall': (day, n) => `last call: ${day}; ${n} sessions since had it in the catalog and never used it`,
  'usage.descChangedOn': (day) => `the description the model saw changed on ${day}`,

  'up.offline': () => 'offline mode, not checked',
  'up.localMissing': (path) => `the source path doesn't exist: ${path} (check this skill's metadata.source)`,
  'up.suspicious': (url) => `refusing a suspicious source address: ${url}`,
  'up.gh404': () => 'GitHub returned 404 (deleted or made private)',
  'up.ghUnknown': (detail) => `${detail}; the GitHub API couldn't confirm either`,
  'up.unreachable': (detail) => `upstream can't be checked right now: ${detail}`,
  'up.repoMissing': (detail) => `the upstream repository is gone (${detail}); your local copy is unmaintained`,
  'up.repoMoved': (url) => `the upstream repository moved to ${url}`,
  'up.adoptHint': () => 'update the source with skill-healthcheck adopt',
  'up.removed': (date) => `upstream deleted this skill${date ? ` (${date})` : ''}; your local copy is unmaintained`,
  'up.deletedIn': (sha) => `deleted in commit ${sha}`,
  'up.minor': () => 'minor upstream changes (triggering unaffected)',
  'up.updatedOn': (date) => `upstream updated ${date}`,
  'up.updated': () => 'upstream has updates',
  'up.localModified': () => '; you also edited this file locally',

  'impact.invalid': (reason) => `the new upstream version would be silently dropped: ${reason}`,
  'impact.renamed': (to, from) => `upstream renamed it to ${to} → your /${from} stops working`,
  'impact.newEntry': (name) => `new entry point: /${name}`,
  'impact.modelDisabled': () => 'upstream added disable-model-invocation; the model will stop using it on its own',
  'impact.userDisabled': (name) => `upstream added user-invocable: false; /${name} stops working`,
  'impact.descChanged': (parts) => `upstream changed the description: ${parts}`,
  'impact.descExpanded': (parts) => `upstream expanded the description: ${parts}`,
  'impact.wording': () => 'wording tweaks',
  'impact.removedWords': (words) => `removed ${words}`,
  'impact.addedWords': (words) => `added ${words}`,
  'impact.join': () => '; ',
  'impact.was': (text) => `was: ${text}`,
  'impact.now': (text) => `now: ${text}`,
  'impact.newSignal': (hit, title) => `adds "${hit}" (${title})`,
  'impact.truncated': (len, max) => `description is now ${len} characters; past ${max} it gets truncated`,
  'impact.hiddenTail': (tail) => `ending the model won't see: …${tail}`,
  'impact.catalogShows': (text) => `catalog shows: ${text}`,
  'impact.descGrew': (n) => `description grew by ${n} characters, costing catalog context every turn`,
  'impact.scriptsAdded': (n) => `${n} new ${n === 1 ? 'script' : 'scripts'}; review the code before using it`,
  'impact.foreignScripts': (files) => `${files} may not run on this system`,
  'impact.scriptsChanged': (n) => `${n} ${n === 1 ? 'script' : 'scripts'} changed; review again`,
  'impact.bodyGrew': (chars, tokens) => `body +${chars} (~+${tokens} tokens per invocation)`,
  'impact.chars': (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k characters` : `${n} characters`),
  'impact.platform': (labels, os) => `adds ${labels}-specific syntax; may not work on your ${os}`,
  'impact.moved': (path) => `upstream moved the skill to ${path}`,

  'plugin.notInstalled': () => 'declared but missing from node_modules; the host will refuse to load it',
  'plugin.requires': (unmet, host) => `requires ${unmet}; this is dsh ${host}`,
  'plugin.exempt': (host) => `incompatible with dsh ${host}, running on a version exemption`,
  'plugin.deprecated': (msg) => `deprecated by its author: ${msg}`,
  'plugin.stale': () => 'no release in over a year, and incompatible with this dsh',
  'plugin.latestIncompatible': (latest, req) => `${latest} doesn't support this dsh either (${req})`,
  'plugin.broken': () => 'broken',

  'r.header': (label, profile, when) => `skill-healthcheck · ${label}${profile} · ${when}`,
  'r.profile': (name) => ` · profile ${name}`,
  'r.host': () => 'Host',
  'r.plugins': () => 'Plugins',
  'r.skills': () => 'Skills',
  'r.pluginCounts': (total, ok, up, broken) => `${total}: ${ok} ok · ${up} upgradable · ${broken} broken`,
  'r.offlinePlugins': () => ' (offline, new versions not checked)',
  'r.bundles': (n) => `  +${n} ${n === 1 ? 'bundle' : 'bundles'}`,
  'r.noProfile': () => 'no readable profile, skipped',
  'r.skillCounts': (total, ok, up, broken) => `${total}: ${ok} ok · ${up} updated upstream · ${broken} broken`,
  'r.unchecked': (n) => ` (${n} not checked upstream)`,
  'r.bundled': (n) => `  (incl. ${n} bundled)`,
  'r.critical': () => '  ⚠ critical',
  'r.high': () => '  high risk',
  'r.evidence': (name, msg) => `evidence: ${name} ${msg}`,
  'r.unknownSources': (n) => `${n} with unknown source, upstream not checked. Installed from a git repo? skill-healthcheck adopt --repo <repo>. Your own skills need nothing`,
  'r.more': (n) => `…${n} more (skill-healthcheck --all)`,
  'r.allGood': () => 'Summary: everything still works; nothing for you to do',
  'r.summary': (parts) => `Summary: ${parts}`,
  'r.summaryJoin': () => '; ',
  'r.upgradable': (n) => `${n} ${n === 1 ? 'plugin' : 'plugins'} can be upgraded in one go`,
  'r.needReview': (n) => `${n} ${n === 1 ? 'skill needs' : 'skills need'} your review, one by one`,
  'r.recordingStarted': (n) => `Recording started (${n} ${n === 1 ? 'entry' : 'entries'}). Every run from now on records what changed.`,
  'r.journalOff': (error) => `can't write the journal (${error}); this result still stands, but history won't update.`,
  'r.hostGeneric': () => 'generic mode',
  'r.hostGenericDetail': () => 'checking Claude Code and Codex skills',
  'r.genericLabel': () => 'Agent Skills',
  'host.noProfile': () => 'profile directory not found',
  'host.badPackage': (file) => `can't parse the profile's package.json: ${file}`,
  'host.noVersion': () => "can't read the dsh runtime version",

  'ls.header': (label, root) => `${label} · project root ${root}`,
  'ls.manual': () => '  (manual only)',
  'ls.shadowed': (source, by) => `${source}, shadowed by ${by}`,
  'ls.nested': (n) => `${n} nested ${n === 1 ? 'skill' : 'skills'}, never discovered`,
  'ls.unscanned': (_path, n) => `not scanned (${n})`,
  'ls.runtime': (n) => `${n} more come from plugins or are built into the host, not these folders (from the catalog in session logs):`,

  'log.empty': () => 'Nothing recorded yet.',
  'log.kind.baseline': () => 'present',
  'log.kind.added': () => 'added',
  'log.kind.changed': () => 'changed',
  'log.kind.removed': () => 'removed',
  'log.kind.moved': () => 'moved',
  'log.kind.status': () => 'status',
  'log.kind.adopted': () => 'adopted',
  'log.kind.upstream-changed': () => 'upstream',
  'log.nameChanged': (from, to) => `name ${from} → ${to}`,
  'log.descChanged': () => 'description changed',
  'log.invocation': () => 'invocation policy changed',
  'log.body': (delta) => `body ${delta} characters`,
  'log.scriptsAdded': (files) => `new scripts ${files}`,
  'log.scriptsChanged': (files) => `scripts changed ${files}`,
  'log.join': () => '; ',
  'journal.baselineNote': () => 'already present at the first run; time taken from the file',
  'journal.removedNote': () => 'removed some time between the previous run and this one',

  'why.title': (symptom, topic) => `why${symptom} → ${topic}`,
  'why.noSymptom': () => 'no known symptom matched; listing changes by time',
  'why.topicJoin': () => ', ',
  'why.onset': (evidence) => `Onset: ${evidence}`,
  'why.languageOnset': (day, before, that) => `share of Chinese in replies: ~${before} before ${day}, ${that} that day (you kept asking in Chinese)`,
  'why.since': (day) => `looking around ${day}`,
  'why.none': () => 'No suspects. The journal may be too young, or the cause is not in a skill.',
  'why.footer': () => 'Ranked by time and keywords, not a verdict. Disable #1 first to confirm.',
  'why.catalogChanged': (day) => `the description the model sees changed on ${day}`,
  'why.added': (hit) => `adds "${hit}"`,
  'why.lost': (hit) => `dropped "${hit}"`,
  'why.removedWords': (words) => `removed ${words}`,
  'why.addedWords': (words) => `added ${words}`,
  'why.estimated': () => ' (estimated from file time)',
  'why.verb.added': () => 'installed',
  'why.verb.changed': () => 'content changed',
  'why.verb.baseline': () => 'installed (present at first run)',
  'why.verb.moved': () => 'moved',
  'why.contains': (hit) => `contains "${hit}"`,
  'why.activeMatch': () => 'active now, contains matching rules',
  'why.quiet': (day) => `never called after ${day}`,
  'why.quietEvidence': (calls, n) => `called ${calls} times, then 0 in ${n} sessions`,

  'cli.help': () => `skill-healthcheck — is what I installed still working? Which piece broke, and since when?

Usage
  skill-healthcheck [check]          one-screen checkup: host, plugins, skills
  skill-healthcheck why "<symptom>"  rank suspicious skills on a timeline, e.g. why "stopped replying in Chinese"
  skill-healthcheck log              the journal: what was installed or changed, and when
  skill-healthcheck ls               skills the platform actually loads (and shadowed/dropped ones)
  skill-healthcheck adopt --repo <repo>
                                     bulk-register sources by matching local skills to a repo, e.g. --repo github:anthropics/skills
  skill-healthcheck adopt <name> <source>
                                     register one skill's source: github:owner/repo/path, a GitHub URL, or <git-url>#<path>
  skill-healthcheck record           record a snapshot silently (for hooks and schedulers)

Options
  --all            show every item and its details
  --json           machine-readable output
  --offline        no network (no upstream or npm checks)
  --no-sessions    don't read session logs
  --since <date>   start time for log/why, e.g. 2026-10-01
  --name <skill>   only show this skill in log
  --lang <zh|en>   output language, defaults to your system locale
  --explain        add a one-sentence LLM explanation of upstream changes (optional; needs
                   ANTHROPIC_API_KEY, DEEPSEEK_API_KEY or SKILL_HEALTHCHECK_LLM_BASE_URL;
                   sends skill texts only, never session logs)
  --platform <dsh|generic>   detected automatically by default
  --profile <name> dsh profile, default desktop
  --cwd <dir>      project directory to use (affects project-level skills)
  --force          overwrite already registered sources (with adopt --repo)

Exit codes: 0 healthy, 1 something is broken, 2 usage error, 3 the tool itself failed.
Read-only: it never modifies or auto-updates anything. The journal lives in ~/.skill-healthcheck/.`,
  'cli.unknownPlatform': (p) => `unknown platform: ${p}`,
  'cli.unknownLang': (l) => `unsupported language: ${l} (use zh or en)`,
  'cli.unknownCommand': (cmd) => `unknown command: ${cmd}`,
  'cli.whyUsage': () => 'usage: skill-healthcheck why "<symptom>" or --since <date>',
  'cli.adoptUsage': () => 'usage: skill-healthcheck adopt <name> <source>  or  skill-healthcheck adopt --repo <repo>',
  'cli.badSource': (spec) => `unsupported source address: ${spec}`,
  'cli.noSuchSkill': (name) => `no active skill named ${name} (see skill-healthcheck ls)`,
  'cli.adopted': (name, where) => `registered: ${name} ← ${where}`,
  'cli.nothingToAdopt': () => 'No skills need a source (use --force to overwrite existing ones).',
  'cli.fetching': (url) => `fetching ${url} …`,
  'cli.repoUnreadable': (detail) => `can't read the repository: ${detail}`,
  'cli.byName': () => 'same name',
  'cli.byContent': (pct) => `${pct}% similar content`,
  'cli.adoptSummary': (total, matched, missed) =>
    `${total} skills in the repo; registered ${matched}${missed ? `, ${missed} local ${missed === 1 ? 'skill' : 'skills'} not found in it` : ''}.`,
  'cli.repoTruncated': () => 'the repository has more than 5000 SKILL.md files; only the first 5000 were scanned.',
  'cli.badDate': (s) => `can't parse date: ${s}`,
  'cli.nodeOld': (v) =>
    `skill-healthcheck needs Node.js 22.19 or newer (you have ${v}). dsh's compressed session logs use zstd, which older Node can't load.\nUpgrade Node and try again: nvm install 22 && nvm use 22`,
  'progress.upstream': (n, url) => `checking upstream (repo ${n}): ${url}`,
  'progress.plugins': () => 'checking plugin versions…',

  'plugin.command': () => 'Skill checkup: which skills silently stopped working, and since when (why <symptom> to trace a cause)',
  'explain.line': (text) => `↳ in plain words: ${text}`,
  'explain.none': () => '--explain: no LLM configured (set ANTHROPIC_API_KEY, DEEPSEEK_API_KEY or SKILL_HEALTHCHECK_LLM_BASE_URL); skipped',
  'explain.via': (provider, model) => `Explanations by ${provider} (${model}), for reference only; the verdicts don't depend on them`,
  'progress.explain': (n) => `writing explanations (${n})…`,

  'os.windows': () => 'Windows',
  'os.macos': () => 'macOS',
  'os.linux': () => 'Linux',
  'os.posix': () => 'macOS/Linux',
}

const CATALOGS: Record<Lang, Catalog> = { zh, en }

let lang: Lang = detectLang()

export type MessageKey = keyof Catalog

export function t<K extends MessageKey>(key: K, ...args: Parameters<Catalog[K]>): string {
  const fn = CATALOGS[lang][key] as (...a: unknown[]) => string
  return fn(...args)
}

/** Explicit choice, else SKILL_HEALTHCHECK_LANG, else the system locale; anything not Chinese is English. */
export function detectLang(env: NodeJS.ProcessEnv = process.env): Lang {
  const explicit = env.SKILL_HEALTHCHECK_LANG
  if (explicit === 'zh' || explicit === 'en') return explicit
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || Intl.DateTimeFormat().resolvedOptions().locale || ''
  return /^zh/i.test(locale) ? 'zh' : 'en'
}

export function setLang(next?: string): void {
  lang = next === 'zh' || next === 'en' ? next : detectLang()
}

export function getLang(): Lang {
  return lang
}

export function isLang(value: string): value is Lang {
  return value === 'zh' || value === 'en'
}
