/**
 * Output translation for `--lang en`.
 *
 * The renderers build Chinese sentences inline, so instead of threading a
 * locale through every template we translate the finished text right before it
 * reaches stdout. Rules are ordered: specific sentences first, bare labels last.
 * Anything left untranslated shows up as Chinese in the output, which
 * `test/i18n.test.ts` guards against for the demo path.
 */

export type Lang = 'zh' | 'en'

let lang: Lang = 'zh'

export function setLang(next: string | undefined): void {
  lang = next === 'en' ? 'en' : 'zh'
}

export function getLang(): Lang {
  return lang
}

type Rule = [RegExp, string]

const SYMPTOM_TITLES: Record<string, string> = {
  '回复语言变了（不用中文 / 中英混杂）': 'reply language changed',
  '语气与正式程度变了（太官方 / 太啰嗦 / 太随意）': 'tone or formality changed',
  '回答长度变了（变长 / 变短）': 'answer length changed',
  '输出格式变了（表格 / emoji / markdown 标题 / 不用代码块）': 'output format changed',
  '问太多问题、不敢动手': 'asks too many questions',
  '不经确认就执行操作': 'acts without confirmation',
  '不跑测试、跳过验证': 'skips tests or verification',
  '乱建文件、生成多余文档': 'creates extra files',
  'git 行为变了（自动提交 / 改 commit 信息格式）': 'git behaviour changed',
  '代码风格变了（加注释 / 改命名 / 改缩进）': 'code style changed',
  '变得拒绝或过度谨慎': 'refuses or is over-cautious',
  '某个工具 / 技能不再触发': 'a skill no longer triggers',
  '计划与执行方式变了（总要先写计划 / 不写计划）': 'planning behaviour changed',
  '变慢、上下文变长、token 消耗变大': 'slower or more expensive',
  '规则变成绝对化（always / never / 必须）': 'rules became absolute',
}

const RULES: Rule[] = [
  // --- check header -------------------------------------------------------
  [/^宿主 {2}/gm, 'Host    '],
  // color codes can sit between the label and the numbers; consume them here
  [/^插件 {2}(\d+)：(\d+) 正常 · (?:\x1b\[[0-9;]*m)*(\d+)(?:\x1b\[[0-9;]*m)* 可升级 · (?:\x1b\[[0-9;]*m)*(\d+)(?:\x1b\[[0-9;]*m)* 失效/gm, 'Plugins  $1: $2 ok · $3 upgradable · $4 broken'],
  [/^技能 {2}(\d+)：(\d+) 正常 · (?:\x1b\[[0-9;]*m)*(\d+)(?:\x1b\[[0-9;]*m)* 有更新 · (?:\x1b\[[0-9;]*m)*(\d+)(?:\x1b\[[0-9;]*m)* 失效/gm, 'Skills  $1: $2 ok · $3 update · $4 broken'],
  [/（离线，未查新版本）/g, ' (offline, new versions not checked)'],
  [/ {2}另有组合包 (\d+) 个/g, '  (+$1 bundles)'],
  [/ · (\d+) 未检查/g, ' · $1 unchecked'],
  [/ {2}（含内置 (\d+)）/g, '  (incl. $1 bundled)'],
  [/^插件 {2}/gm, 'Plugins  '],
  [/读不到 profile，跳过/g, 'no profile readable, skipped'],
  [/ {2}⚠最高危/g, '  ⚠ critical'],
  [/ {2}高危/g, '  high risk'],
  [/证据：/g, 'Evidence: '],
  [/^来源未知 (\d+) 个，未检查上游/gm, 'Upstream unknown for $1, not checked'],
  [/…另 (\d+) 项（skill-healthcheck --all）/g, '…$1 more (skill-healthcheck --all)'],

  // --- conclusion ---------------------------------------------------------
  [/结论：都还在正常工作，没有需要你处理的/g, 'Summary: everything still works, nothing for you to do'],
  [/结论：/g, 'Summary: '],
  [/插件 (\d+) 个可一键升级/g, '$1 plugins can be upgraded in one go'],
  [/技能 (\d+) 个需你逐个确认/g, '$1 skills need you to review them'],
  [/\b1 skills need you to review them/g, '1 skill needs you to review it'],
  [/\b1 plugins can be upgraded in one go/g, '1 plugin can be upgraded in one go'],
  // --- impact findings ----------------------------------------------------
  [/上游新版本会被静默丢弃：/g, 'The new upstream version would be silently dropped: '],
  [/上游改名为 (.+?) → 你的 \/(.+?) 会失效/g, 'Upstream renamed it to $1 → your /$2 stops working'],
  [/新入口：\//g, 'New entry: /'],
  [/上游加了 disable-model-invocation，模型将不再自动使用它/g, 'Upstream added disable-model-invocation; the model will no longer use it automatically'],
  [/上游加了 user-invocable: false，\/(.+?) 会失效/g, 'Upstream added user-invocable: false; /$1 stops working'],
  [/上游改了 description：/g, 'Upstream changed the description: '],
  [/上游扩写了 description：/g, 'Upstream expanded the description: '],
  [/措辞调整/g, 'wording tweaks'],
  [/删去 /g, 'removed '],
  [/新增 /g, 'added '],
  [/^旧：/gm, 'was: '],
  [/^新：/gm, 'now: '],
  [/description 变为 (\d+) 字符，超过 (\d+) 会被截断/g, 'description is now $1 characters; over $2 it gets truncated'],
  [/description 变长 (\d+) 字符，每轮都多占目录上下文/g, 'description grew by $1 characters, costing catalog context every turn'],
  [/新增 (\d+) 个脚本，需人工审代码后再用/g, '$1 new scripts; review the code before use'],
  [/(\d+) 个脚本内容有改动，需复核/g, '$1 scripts changed; review them'],
  [/正文 \+(\d+)（每次调用约 \+(\d+) token）/g, 'body +$1 characters (~+$2 tokens per invocation)'],
  [/新增了 (.+?) 专用写法，在你的 (.+?) 上可能失效/g, 'new syntax specific to $1; may not run on your $2'],
  [/上游把技能移到了 /g, 'Upstream moved the skill to '],
  [/其中 (.+) 在当前系统上可能跑不起来/g, '$1 may not run on this system'],

  // --- why ----------------------------------------------------------------
  [/现象起点：/g, 'Onset: '],
  [/助手回复的中文占比：(\S+) 之前约 (\S+)，当天 (\S+)（你仍在用中文提问）/g, 'share of Chinese replies: ~$2 before $1, $3 that day (you were still asking in Chinese)'],
  [/(\S+) 起模型看到的 description 变了/g, 'the description the model sees changed on $1'],
  [/这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。/g, 'Ranked by time and keywords, not a verdict. Disable #1 first to confirm.'],
  [/没找到可疑项。记录可能还太少，或者原因不在技能里。/g, 'No suspects. The journal may be too young, or the cause is not in a skill.'],
  [/未匹配到已知症状，按时间列出变更/g, 'no known symptom matched; listing changes by time'],
  [/从 (\S+) 前后开始查/g, 'looking around $1'],
  [/已开始记录（(\d+) 条）。以后每次运行都会记下变化。/g, 'Recording started ($1 events). Every run now saves what changed.'],

  // --- inventory ----------------------------------------------------------
  [/^项目根 /gm, 'project root '],
  [/被 (.+?) 遮蔽/g, 'shadowed by $1'],
  [/嵌套 (\d+) 个技能，不会被发现/g, '$1 skills nested here, never discovered'],
  [/仅手动/g, 'manual only'],
  [/还没有记录。/g, 'Nothing recorded yet.'],

  // --- symptom titles (longest first so partial names don't win) ----------
  ...Object.entries(SYMPTOM_TITLES)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([zh, en]): Rule => [new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), en]),

  // --- why evidence -------------------------------------------------------
  [/（按文件时间估计）/g, ' (estimated from file mtime)'],
  [/已安装（首次记录时）/g, 'installed (first recorded)'],
  [/当前生效，内容含相关规则/g, 'currently active, contains matching rules'],
  [/内容变更/g, 'content changed'],
  [/内容含"/g, 'contains "'],

  // --- punctuation last: earlier sentence rules must match first ----------
  [/，/g, ', '],
  [/；/g, '; '],
  [/新增"/g, 'added "'],
]

export function tr(text: string): string {
  if (lang !== 'en' || !text) return text
  let out = text
  for (const [re, rep] of RULES) out = out.replace(re, rep)
  return out
}

/** Wrap stdout so every rendered line goes through `tr` when English is selected. */
export function installOutputTranslation(): void {
  if (lang !== 'en') return
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    if (typeof chunk === 'string') return (write as (c: string, ...r: unknown[]) => boolean)(tr(chunk), ...rest)
    return (write as (c: unknown, ...r: unknown[]) => boolean)(chunk, ...rest)
  }) as typeof process.stdout.write
}
