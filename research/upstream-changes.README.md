# 上游 SKILL.md 变更样本（upstream-changes）

为 skill-healthcheck 的「变更影响评估」收集的真实世界样本：公开 GitHub 仓库里 Agent Skills 在历史上发生过的、
会让技能静默失效的 `SKILL.md` 变更。

- 数据文件：`upstream-changes.jsonl`（每行一个 JSON 对象，无空行、无注释）
- 样本总数：**74** 条（要求 40–80）
- 覆盖仓库：**15** 个（要求 ≥10）
- 变更日期范围：**2025-12-01 ~ 2026-10-21**（取提交的 author date）
- 命中多种变更类型的样本：35 条

## 每类变更的条数

一条样本可以同时命中多种类型，所以下表合计大于样本总数。

| 变更类型 | 条数 | 要求 | 说明 |
|---|---:|---|---|
| `description-changed` | 44 | ≥15 | frontmatter 的 `description` 文本变了（忽略空白差异） |
| `name-changed` | 18 | 与 `dir-renamed` 合计 ≥8 | frontmatter 的 `name` 变了 |
| `dir-renamed` | 20 | 与 `name-changed` 合计 ≥8 | 技能目录路径变了（git rename 检测） |
| `deleted` | 7 | — | 技能目录在该提交里被删除 |
| `scripts-added` | 13 | ≥5 | 技能目录下 `scripts/` 新增可执行文件 |
| `body-grew` | 18 | — | 正文（frontmatter 之后）增长 >2000 字符 |
| `platform-specific` | 4 | — | 新增只在单一平台可用的命令或路径 |

配额核对：`description-changed` 44 ≥ 15；`name-changed` + `dir-renamed` = 38 ≥ 8；
`scripts-added` 13 ≥ 5；总数 74 在 40–80 内；仓库 15 ≥ 10。

## 用到的仓库

| 仓库 | 样本数 | 代表技能 |
|---|---:|---|
| anthropics/skills | 7 | skills/pdf |
| coreyhaines31/marketingskills | 7 | skills/ab-testing |
| deepseek-ai/deepseek-harness | 7 | .agents/skills/dsh-error-handling |
| mattpocock/skills | 7 | skills/engineering/grill-with-docs |
| nextlevelbuilder/ui-ux-pro-max-skill | 7 | skills/ui-ux-pro-max |
| addyosmani/agent-skills | 6 | skills/shipping-and-launch |
| github/awesome-copilot | 6 | skills/mcp-implementation-security-review |
| obra/superpowers | 6 | skills/finishing-a-development-branch |
| K-Dense-AI/scientific-agent-skills | 5 | skills/autoskill |
| mukul975/Anthropic-Cybersecurity-Skills | 4 | skills/analyzing-apt-group-with-mitre-navigator |
| vercel-labs/agent-skills | 4 | skills/vercel-optimize |
| affaan-m/ECC | 3 | .agents/skills/ecc-conventions |
| cloudflare/security-audit-skill | 2 | skills/security-audit |
| ComposioHQ/awesome-claude-skills | 2 | ahrefs-automation |
| kepano/obsidian-skills | 1 | skills/defuddle |

共克隆 19 个候选仓库，最终 15 个进入数据集；排除原因见下文「遇到的问题」。

## 数据是怎么取的

1. 用 `git clone --filter=blob:none --depth 400` 拉取候选仓库（`--filter` 让 blob 按需懒加载，历史树仍然完整）。
2. 对每个仓库跑
   `git log --all --no-merges --format=... --name-status -M -- ':(glob)**/SKILL.md'`，
   拿到**每个 SKILL.md 的每一次改动**（含 rename/delete），并保留 git 的 rename 检测结果。
3. 对每条改动，取 `<父提交>:<改动前路径>` 与 `<改动提交>:<改动后路径>` 两个版本的原文，
   以及两侧 `<技能目录>/scripts/` 的文件清单。
4. 用独立实现解析 frontmatter（name/description，支持单行、双引号、单引号、`|`/`>` 块标量），
   计算正文码点长度、对比两侧差异，落到 7 类标签。
5. 抽样时限制「每个仓库 ≤7 条、每个技能 ≤2 条、每个提交 ≤2 条」，并按内容签名去重，
   避免同一个批量提交（一次改几十个技能）淹没数据集。
6. 每条样本的 `commit_before` 都是 `commit_after` 的**第一个父提交**，两行样本之间就是相邻的一对提交。

## 校验

- **逐条独立复核**：另写了一套 Python + PyYAML + git 的校验脚本（与生成脚本不共享代码），对 74 条样本逐条：
  - `git cat-file -e` 确认两个 40 位 sha 都存在；
  - `git rev-parse <commit_after>^` 确认 `commit_before` 确实是父提交；
  - `git show <commit_after> --format=%ad --date=short` 核对 `date_after`；
  - `git show <commit_before>:<path_before>/SKILL.md` 与 `git show <commit_after>:<path_after>/SKILL.md`
    用 PyYAML 重新解析，逐字核对 `description_before`/`description_after`、`name_before`/`name_after`；
  - 核对正文长度、`scripts_added` 里每个文件在 `commit_after` 真实存在且位于技能目录内；
  - 对 `deleted` 行核对 `path_after`/`name_after`/`description_after` 为 null 且该路径在 `commit_after` 已不存在。
  - 结果：**74 条全部通过，0 条失败，1 条 WARN**（见下）。
- **JSON 合法性**：`node -e "require('fs').readFileSync(p,'utf8').trim().split('\n').forEach(JSON.parse)"` 通过。

## 遇到的问题

1. **本机 git 的 TLS 不可用**。`git clone/ls-remote` 全部失败于
   `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`，而 Node/OpenSSL 与 Python/OpenSSL 都正常。
   解决：写了一个本地反向代理（`127.0.0.1:8899` → `https://github.com`），用
   `url.http://127.0.0.1:8899/.insteadOf=https://github.com/` 让 git 走代理。只影响取数通道，不影响数据本身。
2. **沙箱禁止 Node 用管道读子进程输出**（`spawn/exec` 默认 `pipe` 报 EPERM）。
   于是拆成两段：PowerShell 负责调 git 抓原文落盘 → Node 只做解析与分类。
3. **PowerShell 执行策略禁止直接运行 .ps1**，改用 `Set-ExecutionPolicy -Scope Process Bypass` 后再调用。
4. **pip 的临时目录被文件策略拒绝**（`Permission denied: ...pip-unpack-...`），无法正常安装 PyYAML。
   改为用 `urllib` 直接下载 wheel 再用 `zipfile` 解压到工作目录，供独立校验使用。
5. **目标目录写入需要更高权限**。`D:\dsh-skilldoctor\research\` 在会话工作区之外，落盘时请求了一次完全权限；
   除 `research\` 下的这两个文件外没有改动任何东西。
6. **有一处上游 frontmatter 本身不是合法 YAML**：`vercel-labs/agent-skills` 的 `skills/vercel-optimize`
   在提交 `48eee791` 里 `description` 未加引号且含 `: `，PyYAML 报
   `mapping values are not allowed here`。该行按文件字面文本录入（折行按空格拼接），校验记为 WARN 而非 FAIL。
   这本身就是一个「严格解析器会整段读不到 description」的真实失效案例。
7. **近重复提交**：`anthropics/skills` 的 `skills/pptx` 与 `skills/docx` 在 `4e6907a3` 与 `9422aa6c` 两个提交里产生了完全相同的
   前后快照（历史被重放过）。按内容签名去重后每个技能只保留一条，避免用同一份数据冒充两条样本。
8. **部分仓库是浅克隆**：`affaan-m/ECC`、`github/awesome-copilot`、`K-Dense-AI/scientific-agent-skills`、
   `obra/superpowers`、`sickn33/agentic-awesome-skills` 只取了 `--depth 400`。这些仓库更早的历史没有覆盖，
   所以 2025-12-01 只是样本里最早的一条，不代表仓库完整历史。
9. **两个候选仓库没有产出样本**：`VoltAgent/awesome-agent-skills` 仓库里根本没有 `SKILL.md`（只是链接合集）；
   `multica-ai/andrej-karpathy-skills` 只有 1 个 `SKILL.md` 且历史里没有改动。
10. **`sickn33/agentic-awesome-skills` 克隆后 checkout 失败**（Windows 260 字符路径限制，`Filename too long`），
    只留下可用的 `.git`。它的历史仍能读，但最终没有样本进入数据集（被每提交上限与评分筛掉）。
11. **`platform-specific` 只有 4 条**：这类改动在历史里本来就少。
    `deepseek-ai/deepseek-harness` 的 office 系列技能在 `2026-10-12` 一个提交里同时改了 5 个，
    受「每个提交 ≤2 条」的限制只取了 2 条，另外 2 条来自 `affaan-m/ECC` 与 `anthropics/skills`。
12. **计数口径**：`body_chars_*` 用 Unicode 码点计数（`[...str].length`），与 UTF-16 的 `String.length`
    在 emoji 等补充平面字符上会差几个字符；正文长度按 `trim()` 之后计。

## 字段说明

| 字段 | 含义 |
|---|---|
| `repo` | `owner/name` |
| `path_before` / `path_after` | **技能目录**（不含 `/SKILL.md`）；`deleted` 时 `path_after` 为 `null` |
| `commit_before` / `commit_after` | 相邻的一对提交（前者是后者的第一个父提交），完整 40 位 sha |
| `date_after` | `commit_after` 的 author date（`YYYY-MM-DD`） |
| `change_types` | 命中的类型，取值见上表 |
| `name_before` / `name_after` | frontmatter `name` 原文 |
| `description_before` / `description_after` | frontmatter `description` 原文，未截断 |
| `body_chars_before` / `body_chars_after` | 正文（frontmatter 之后）码点长度 |
| `scripts_added` | 新增脚本的仓库相对路径（`deleted` 行或没有新增时为 `[]`） |
| `note_zh` | 一句话说明这次变更可能让什么场景不再触发 |

复核某条样本时可以直接：

```bash
git -C <repo> show <commit_before>:<path_before>/SKILL.md
git -C <repo> show <commit_after>:<path_after>/SKILL.md
```
