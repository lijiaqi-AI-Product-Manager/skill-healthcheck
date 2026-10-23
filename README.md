# skill-healthcheck

[English](README.en.md) | 中文

> 你的 agent 最近变笨了？可能是三周前装的那个 skill。

插件坏了你马上会知道：装不上、报错、界面消失。**技能（skill）坏了你永远不知道**：`SKILL.md` 还在磁盘上，看起来一切正常，但模型再也不会用它了。原因可能是上游改了 `description`、给技能改了名、删了仓库，也可能是本地有一个同名技能把它遮住了。你只会觉得"agent 最近不听话了 / 不用中文了"，然后去怀疑模型和提示词。

`skill-healthcheck` 只回答一个问题：

**我装的东西现在还有用吗？没用的是哪个、从什么时候开始的？**

一个命令、一次体检、一屏输出。它只读不写，从不自动更新。

```
$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 11:57
宿主  dsh 0.2.1-rc.2 ✓
插件  0：0 正常 · 0 可升级 · 0 失效  另有组合包 1 个
技能  2：1 正常 · 1 有更新 · 0 失效
      ↑ zh-writer        上游改了 description：删去 "中文" "写作" "助手"，新增 "professional" "assistant" "marketing"  ⚠最高危
结论：技能 1 个需你逐个确认

$ skill-healthcheck why "为什么它现在不用中文回答我了"
why "为什么它现在不用中文回答我了" → 回复语言变了
现象起点：助手回复的中文占比：2026-10-19 之前约 100%，当天 0%（你仍在用中文提问）
1. doc-writer           2026-10-19 起模型看到的 description 变了
     新增"professional tone"
     新增"Always respond in English"
     删去 "需求" "整理" "结构" "清晰"
这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。
```

（上面是 `npm run demo` 的真实输出：两个技能来自本地 git 仓库，会话日志是合成的。）

## 安装

需要 Node.js 22.19+ 和 git。

```bash
npm install -g skill-healthcheck
```

还没发布到 npm 时，从源码安装：

```bash
git clone <this repo> && cd skill-healthcheck && npm install && npm run build && npm link
```

## 用法

| 命令 | 作用 |
|---|---|
| `skill-healthcheck` | 一屏体检：宿主、插件、技能 |
| `skill-healthcheck why "<现象>"` | 按时间线反查可疑技能，例如 `why "不用中文回答了"`；也可以用 `--since 2026-10-01` |
| `skill-healthcheck log` | 记录：装了什么、改了什么、什么时候（`~` 表示时间按文件时间估计） |
| `skill-healthcheck ls` | 平台实际会加载哪些技能，哪些被遮蔽、被丢弃 |
| `skill-healthcheck adopt <name> <来源>` | 登记技能来源：`github:owner/repo/path`、GitHub 链接或 `<git-url>#<path>` |
| `skill-healthcheck record` | 只记录一次快照（给钩子、定时任务用） |

通用选项：`--all` 展开全部、`--json` 机器可读、`--offline` 不联网、`--no-sessions` 不读会话日志、`--platform dsh|generic`、`--profile <名字>`、`--cwd <项目目录>`。

`check` 发现失效项时退出码为 1，可以放进 CI。

## 它检查什么

**技能：本地（离线，确定性）**

| 问题 | 为什么会静默失效 |
|---|---|
| frontmatter 不合法（name 不是 kebab-case、布尔值写错、用了旧字段名） | dsh 直接丢弃整个技能，只在日志里打一行警告 |
| 同名遮蔽 | 项目级 `.dsh/skills` 里的同名技能会盖住你全局装的那个 |
| 嵌套太深 | 只认 `<根>/<名>/SKILL.md`；把整个技能仓库 clone 进去，一个都不生效 |
| 放错目录 | dsh 不扫描 `~/.claude/skills`、`~/.codex/skills` |
| description 超过 500 字符 | 目录里被截断，结尾的触发词模型看不到 |
| 曾经常用、某天之后再没调用过 | 从会话日志里看到的证据，比任何推断都硬 |

**技能：上游（git，任何托管平台）**

| 上游变化 | 影响 |
|---|---|
| 改了 `description` | ⚠ 最高危：触发条件变了，可能从此不再被调用。会列出删掉和新增的词，标出语言/语气类规则 |
| 改了 `name` / 目录移动 | `/旧名字` 入口失效，会告诉你新入口 |
| 仓库删了 / 技能删了 | 本地副本已无人维护（只有明确的 404 才算删除，网络失败只报"无法检查"） |
| `scripts/` 新增可执行文件 | 需要人来审代码 |
| description 变长或超过上限 | 会被截断，或者每轮都多占上下文 |
| 正文变长 | 每次调用多占多少 token（正文按需加载，不会挤掉别的技能） |
| 新增平台专用写法 | 比如 PowerShell cmdlet、`brew`、`/usr/bin`，在你的系统上可能跑不起来 |

**插件（dsh）**：profile 里装的插件是否与当前 dsh 版本兼容（`engines.dsh` / peerDependencies）、是否靠版本豁免在跑、npm 上有没有可升级的新版本、是否被作者弃用。

**结论行是故意不对称的**：`插件 2 个可一键升级；技能 3 个需你逐个确认`。插件是 npm 包，有版本号、能回滚；技能是提示词，覆盖了就没了，改了行为你也不知道，所以必须由人来看。

## 归因：`why`

工具第一次运行就开始记录（`~/.skill-healthcheck/journal.jsonl`）：装了什么、改了什么、删了什么，每个版本的 `SKILL.md` 全文都存一份。`why` 用这些记录，再加上 dsh 自己的会话日志（里面有模型每次看到的技能目录，按时间排好），把可疑项排出来：

- **症状词典**：把"不用中文了"映射到语言类规则（`respond in English`、`professional tone`、`默认使用英文`…）
- **时间**：离现象起点越近的变更越可疑；现象之后才发生的变更降权
- **行为变点**：从会话日志算出助手回复的中文占比、技能调用次数，找出变化开始的那一天

全部是确定性代码，不调用 LLM，结果稳定、可测试。

## 在真实数据上验证过

我们从 15 个公开技能仓库（anthropics/skills、obra/superpowers、vercel-labs/agent-skills、deepseek-ai/deepseek-harness 等）收集了 74 条真实的 `SKILL.md` 变更，逐条用规则跑了一遍：

| 变更类型 | 报出 / 实际 |
|---|---:|
| description 被改 | 44 / 44 |
| name 被改 | 18 / 18 |
| 目录移动 | 20 / 20 |
| 新增脚本 | 13 / 13 |

在这批数据里，有 37 次上游改动删掉了 description 里原有的词，16 次改了 name，3 次改完之后的新版本会被 dsh 直接丢弃。数据集、复现方法和规则调整见 [research/EVAL.md](research/EVAL.md)。

## 数据与隐私

- 只读你的技能目录、dsh profile 和会话日志；除了 `~/.skill-healthcheck/` 不写任何文件。
- 会话日志只在本地读，只缓存派生数据（技能目录、调用次数、每天的中文占比），不保存对话原文。
- 上游检查在 `~/.skill-healthcheck/cache/` 的独立裸仓库里进行，不会 fetch 或修改你自己的技能仓库。
- 联网只做三件事：`git fetch` 技能上游、GitHub API 确认仓库是否存在、`npm view` 查插件版本。`--offline` 全部关闭。

## 平台支持

| 平台 | 支持程度 |
|---|---|
| DeepSeek Harness（dsh） | 完整：照搬 dsh 的扫描顺序和解析规则、会话日志回填、插件和宿主检查 |
| 通用 Agent Skills（Claude Code、Codex 等） | 扫描 `.agents/skills`、`.claude/skills`、`~/.codex/skills`，做本地检查和上游检查 |

检测到 `~/.dsh/profiles` 时自动进入 dsh 模式，也可以用 `--platform` 指定。

## 技能的来源怎么确定

dsh 本身不记录技能是从哪装的，所以按这个顺序找，找不到就如实说"来源未知"，不猜：

1. `skill-healthcheck adopt` 登记过的来源
2. frontmatter 里的 `metadata.source`
3. 技能所在目录是一个 git checkout → 用它的 `origin`

## 开发

```bash
npm install
npm test        # vitest：解析规则、发现规则、记录器、影响规则、上游（本地裸仓库）、归因、词典
npm run demo    # 15 秒演示，全部在 demo/.sandbox 里进行
node scripts/corpus-eval.mjs   # 在 74 条真实变更上跑影响规则（需要先 build，会联网取文件）
```

## 路线图

- [x] 记录器、本地静默失效检查、会话日志回填
- [x] 上游存活检查与变更影响评估
- [x] `why` 归因（最小版本）
- [x] 插件兼容性与可升级检查（dsh）
- [ ] dsh 插件外壳 `dsh-skill-healthcheck`：宿主启动时记录、监听技能变化、提供 `/skill-healthcheck`
- [ ] 可选 `--explain`：用 LLM 把 diff 翻成一句人话（默认关闭）
- [ ] 英文输出（`--lang en`）

## License

MIT
