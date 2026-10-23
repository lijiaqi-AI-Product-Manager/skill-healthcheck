# skill-healthcheck

[English](README.md) | 中文 | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqimun-coder/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="欢迎 PR">
</p>

<p align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=20&pause=1200&color=3FB950&center=true&vCenter=true&width=720&lines=Find+skills+that+silently+stopped+working;Know+when+your+agent%27s+behavior+changed" alt="找出悄悄失效的 skill">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqimun-coder/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck 演示：上游改了 description，why 把行为变化归因到具体 skill" width="900">
</p>

> 你的 agent 最近变笨了？可能是三周前装的那个 skill。

插件坏了你马上会知道：装不上、报错、界面消失。**技能（skill）坏了你永远不知道**：`SKILL.md` 还在磁盘上，看起来一切正常，但模型再也不会用它了。原因可能是上游改了 `description`、给技能改了名、删了仓库，也可能是本地有一个同名技能把它遮住了。你只会觉得"agent 最近不听话了 / 不用中文了"，然后去怀疑模型和提示词。

`skill-healthcheck` 只回答一个问题：

**我装的东西现在还有用吗？没用的是哪个、从什么时候开始的？**

一个命令、一次体检、一屏输出。它只读不写，从不自动更新。

```text
$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:28
宿主  dsh 0.2.1-rc.2 ✓
插件  0：0 正常 · 0 可升级 · 0 失效  另有组合包 1 个
技能  2：2 正常 · 0 有更新 · 0 失效
结论：都还在正常工作，没有需要你处理的
已开始记录（2 条）。以后每次运行都会记下变化。

$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:28
宿主  dsh 0.2.1-rc.2 ✓
插件  0：0 正常 · 0 可升级 · 0 失效  另有组合包 1 个
技能  2：1 正常 · 1 有更新 · 0 失效
      ↑ zh-writer        上游改了 description：删去 "Chinese" "paragraphs" "rewritten"，新增 "professional" "marketing" "posts"  ⚠最高危
结论：技能 1 个需你逐个确认

$ skill-healthcheck why "为什么它现在不用中文回答我了"
why "为什么它现在不用中文回答我了" → 回复语言变了（不用中文 / 中英混杂）
现象起点：助手回复的中文占比：2026-10-19 之前约 100%，当天 0%（你仍在用中文提问）
1. doc-writer           2026-10-19 起模型看到的 description 变了
     新增"professional tone"
     新增"Always respond in English"
     删去 "structured" "clearly"
这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。
```

输出语言跟随系统，`--lang zh` 或 `--lang en` 可以指定。（上面是 `npm run demo -- --lang zh` 的真实输出：两个技能来自本地 git 仓库，会话日志是合成的。）

## 安装

需要 Node.js 22.19+ 和 git。

```bash
npm install -g skill-healthcheck
```

从源码安装：

```bash
git clone https://github.com/lijiaqimun-coder/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

国内用 npmmirror 镜像通常更快：`npm install -g skill-healthcheck --registry=https://registry.npmmirror.com`


## 用法

| 命令                                    | 作用                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `skill-healthcheck`                     | 一屏体检：宿主、插件、技能                                                                     |
| `skill-healthcheck why "<现象>"`        | 按时间线反查可疑技能，例如 `why "不用中文回答了"`；也可以用 `--since 2026-10-01`               |
| `skill-healthcheck log`                 | 记录：装了什么、改了什么、什么时候（`~` 表示时间按文件时间估计）                               |
| `skill-healthcheck ls`                  | 平台实际会加载哪些技能，哪些被遮蔽、被丢弃                                                     |
| `skill-healthcheck adopt --repo <仓库>` | 批量登记来源：把本地技能和仓库里的技能按名字、内容对上，例如 `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <来源>` | 登记单个技能来源：`github:owner/repo/path`、GitHub 链接或 `<git-url>#<path>`                   |
| `skill-healthcheck record`              | 只记录一次快照（给钩子、定时任务用）                                                           |

通用选项：`--all` 展开全部、`--json` 机器可读、`--offline` 不联网、`--no-sessions` 不读会话日志、`--lang zh|en` 输出语言（默认跟随系统，也可以用环境变量 `SKILL_HEALTHCHECK_LANG`）、`--explain` 给每个上游改动加一句人话解读（见下文）、`--platform dsh|generic`、`--profile <名字>`、`--cwd <项目目录>`。

退出码：`0` 一切正常（有更新也算正常），`1` 有失效项（包括被丢弃、被遮蔽、嵌套太深的技能和失效插件），`2` 用法错误。可以直接放进 CI。每种发现都有固定的代码，方便用 `--json` 做二次开发：[docs/findings.md](docs/findings.md)。

技能是复制过来的、没有 `.git`？先跑一次 `skill-healthcheck adopt --repo <它来自的仓库>`，上游检查才能生效。目录被改名的技能也能按内容找回来。

## 在 DeepSeek Harness 里用

配套插件 [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) 运行在 dsh 内部：

- dsh 每次启动都会记录一次快照，dsh 报告技能目录变化时再记一次，你用 dsh 的期间记录不会断；
- 在聊天里增加 `/skill-healthcheck` 命令：同样的一屏体检，另外支持 `why <现象>`、`log`、`ls`。

在 dsh 的插件页安装，或者：

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## 在 Claude Code 和 Codex 里用

没有 dsh 时，`skill-healthcheck` 以通用模式运行：

- **只看各个 agent 实际会加载的技能目录**。Claude Code 是 `.claude/skills`、`~/.claude/skills`；Codex 是 `.codex/skills`、`.agents/skills`、`~/.agents/skills`、`$CODEX_HOME/skills`。
- **从它们的会话日志里回填历史**（`~/.claude/projects`、`~/.codex/sessions`）：模型每次看到的技能目录、每一次技能调用、回复用的语言。所以 `why` 在这两个平台上也能用。
- **同名冲突只在同一个 agent 内部算**。同一个技能给两个 agent 各装一份，不算冲突；同一个 agent 下有两份同名技能才算。

想让记录自动持续，可以在 `~/.claude/settings.json` 里加一个钩子，每次 Claude Code 会话开始时记录一次：

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

Codex 可以用 cron 或 Windows 任务计划程序，每天运行一次 `skill-healthcheck record`。

## 可选：`--explain`

`--explain` 会在每个上游改动下面、以及 `why` 排第一的嫌疑项下面，加一句人话解读（比如"它以后不会再被用于中文写作"）。默认关闭，也不会影响任何结论。按你已有的配置选择模型：

| 环境变量 | 使用的模型 |
|---|---|
| `ANTHROPIC_API_KEY`（或 `ANTHROPIC_AUTH_TOKEN`） | Claude `claude-opus-5-5`，低推理强度，通过官方 SDK 调用，被安全策略拒绝时自动换模型重试 |
| `DEEPSEEK_API_KEY` | DeepSeek `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | 任意 OpenAI 兼容接口（Ollama、vLLM 等） |

可以用 `SKILL_HEALTHCHECK_LLM` 指定用哪一个，用 `SKILL_HEALTHCHECK_LLM_MODEL` 换模型。

- **发送的内容**：只有技能改动前后的文本和检测到的词，绝不发送会话日志。
- **防护**：技能文本作为不可信数据隔离起来，回复会被截成一行。
- **缓存**：同样的改动只调用一次。

## 它检查什么

**技能：本地（离线，确定性）**

| 问题                                                                 | 为什么会静默失效                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| frontmatter 不合法（name 不是 kebab-case、布尔值写错、用了旧字段名） | dsh 直接丢弃整个技能，只在日志里打一行警告                         |
| 同名遮蔽                                                             | 项目级 `.dsh/skills` 里的同名技能会盖住你全局装的那个              |
| 嵌套太深                                                             | 只认 `<根>/<名>/SKILL.md`；把整个技能仓库 clone 进去，一个都不生效 |
| 放错目录                                                             | dsh 不扫描 `~/.claude/skills`、`~/.codex/skills`                   |
| description 超过 500 字符                                            | 目录里被截断，结尾的触发词模型看不到                               |
| 曾经常用、某天之后再没调用过                                         | 从会话日志里看到的证据，比任何推断都硬                             |

**技能：上游（git，任何托管平台）**

| 上游变化                   | 影响                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------- |
| 改了 `description`         | ⚠ 最高危：触发条件变了，可能从此不再被调用。会列出删掉和新增的词，标出语言/语气类规则 |
| 改了 `name` / 目录移动     | `/旧名字` 入口失效，会告诉你新入口                                                    |
| 仓库删了 / 技能删了        | 本地副本已无人维护（只有明确的 404 才算删除，网络失败只报"无法检查"）                 |
| `scripts/` 新增可执行文件  | 需要人来审代码                                                                        |
| description 变长或超过上限 | 会被截断，或者每轮都多占上下文                                                        |
| 正文变长                   | 每次调用多占多少 token（正文按需加载，不会挤掉别的技能）                              |
| 新增平台专用写法           | 比如 PowerShell cmdlet、`brew`、`/usr/bin`，在你的系统上可能跑不起来                  |

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

| 变更类型         | 报出 / 实际 |
| ---------------- | ----------: |
| description 被改 |     44 / 44 |
| name 被改        |     18 / 18 |
| 目录移动         |     20 / 20 |
| 新增脚本         |     13 / 13 |

在这批数据里，有 37 次上游改动删掉了 description 里原有的词，16 次改了 name，3 次改完之后的新版本会被 dsh 直接丢弃。数据集、复现方法和规则调整见 [research/EVAL.md](research/EVAL.md)。

## 数据与隐私

- 只读你的技能目录、dsh profile 和会话日志；除了 `~/.skill-healthcheck/` 不写任何文件。
- 会话日志只在本地读，只缓存派生数据（技能目录、调用次数、每天的中文占比），不保存对话原文。
- 上游检查在 `~/.skill-healthcheck/cache/` 的独立裸仓库里进行，不会 fetch 或修改你自己的技能仓库。
- 技能 frontmatter 里的 `metadata.source` 是第三方写的，一律当作不可信输入：只接受 https/ssh/git/file 地址和绝对路径，拒绝 `--upload-pack=…` 这类参数注入和 `ext::` 等传输方式，git 不会弹出任何认证提示。
- 默认联网只做三件事：`git fetch` 技能上游、GitHub API 确认仓库是否存在、`npm view` 查插件版本。`--offline` 全部关闭。只有加了 `--explain` 才会多一件：把技能改动前后的文本发给你配置的大模型。
- 默认跳过 180 天以前的会话日志（用 `SKILL_HEALTHCHECK_SESSION_DAYS` 调整）。想清空所有记录，删除 `~/.skill-healthcheck/` 即可。

## 平台支持

| 平台                                       | 支持程度                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| DeepSeek Harness（dsh）                    | 完整：照搬 dsh 的扫描顺序和解析规则、会话日志回填、插件和宿主检查                |
| Claude Code 和 Codex（通用模式） | 按各自的技能目录做本地检查和上游检查，并从两者的会话日志回填历史 |

检测到 `~/.dsh/profiles` 时自动进入 dsh 模式，也可以用 `--platform` 指定。

## 技能的来源怎么确定

dsh 本身不记录技能是从哪装的，所以按这个顺序找，找不到就如实说"来源未知"，不猜：

1. `skill-healthcheck adopt` 登记过的来源
2. frontmatter 里的 `metadata.source`
3. 技能所在目录是一个 git checkout → 用它的 `origin`

## 开发

```bash
npm install
npm test        # vitest：解析规则、发现规则、记录器、影响规则、上游（本地裸仓库）、归因、中英文输出、dsh 插件
npm run demo    # 15 秒演示，全部在 demo/.sandbox 里进行
node scripts/corpus-eval.mjs   # 在 74 条真实变更上跑影响规则（需要先 build，会联网取文件）
```

## 路线图

- [x] 记录器、本地静默失效检查、会话日志回填
- [x] 上游存活检查与变更影响评估
- [x] `why` 归因
- [x] 插件兼容性与可升级检查（dsh）
- [x] dsh 插件 `dsh-skill-healthcheck`：宿主启动和技能目录变化时记录，提供 `/skill-healthcheck`
- [x] 中英文输出（`--lang`）
- [x] 可选 `--explain`：用 Claude、DeepSeek 或任意 OpenAI 兼容模型，把每个改动翻成一句人话
- [x] Claude Code 和 Codex 的会话日志回填

欢迎贡献 —— 先读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请走 [SECURITY.md](SECURITY.md)，不要开公开 issue。

## License

MIT
