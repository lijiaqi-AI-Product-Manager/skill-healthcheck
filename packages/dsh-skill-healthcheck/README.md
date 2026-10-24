# dsh-skill-healthcheck

DeepSeek Harness plugin for [skill-healthcheck](https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck): find skills that silently stopped working, and when your agent's behavior changed.

[中文说明](#中文)

## What it does inside dsh

- **Keeps the journal while dsh runs.** It records a snapshot of your installed skills every time dsh starts, and again (debounced) whenever dsh reports that the skill catalog changed. Every version of every `SKILL.md` is kept, so `why` can later point at the change that broke things.
- **Adds `/skill-healthcheck` to the chat.**

| Command | What it does |
|---|---|
| `/skill-healthcheck` | One-screen checkup: host, plugins, skills |
| `/skill-healthcheck why <symptom>` | Rank suspicious skills, e.g. `why stopped replying in Chinese` |
| `/skill-healthcheck log` | Recent changes from the journal |
| `/skill-healthcheck ls` | Skills dsh actually loads, plus shadowed and dropped ones |

It is read-only: it never edits, disables or upgrades a skill or plugin.

## Install

From the Plugins page in dsh, or:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

Requires dsh 0.2 or later. The command-line tool (`npm install -g skill-healthcheck`) shares the same journal in `~/.skill-healthcheck/`.

## Configuration

Optional, in your profile's `cordis.patch.yml`:

```yaml
- id: skill-healthcheck
  config:
    offline: true   # skip upstream git and npm checks in /skill-healthcheck
    lang: en        # zh or en; defaults to your system locale
    explain: true   # one plain sentence per change; needs ANTHROPIC_API_KEY, DEEPSEEK_API_KEY
                    # or SKILL_HEALTHCHECK_LLM_BASE_URL in dsh's environment
```

---

## 中文

[skill-healthcheck](https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck) 的 DeepSeek Harness 插件：找出悄悄失效的技能，以及 agent 行为是从什么时候开始变的。

**它在 dsh 里做两件事：**

- **dsh 运行期间持续记录。** dsh 每次启动都记录一次已装技能的快照，dsh 报告技能目录变化时再记一次（会合并短时间内的多次变化）。每个版本的 `SKILL.md` 都会保存，之后 `why` 才能指出是哪次改动出的问题。
- **在聊天里增加 `/skill-healthcheck`：** 不带参数是一屏体检；`why <现象>` 反查可疑技能；`log` 看最近的变更；`ls` 看 dsh 实际加载了哪些技能。

插件只读：从不修改、停用或升级任何技能和插件。

**安装：** 在 dsh 的插件页安装，或运行 `dsh plugin --profile desktop add dsh-skill-healthcheck`。需要 dsh 0.2 及以上。命令行工具（`npm install -g skill-healthcheck`）和插件共用 `~/.skill-healthcheck/` 里的同一份记录。

**配置（可选）：** 在 profile 的 `cordis.patch.yml` 里给 `id: skill-healthcheck` 加 `config`：`offline: true` 跳过联网检查，`lang: zh` 或 `en` 指定语言，`explain: true` 给每个改动加一句大模型解读（需要 dsh 的环境里有 `ANTHROPIC_API_KEY`、`DEEPSEEK_API_KEY` 或 `SKILL_HEALTHCHECK_LLM_BASE_URL`）。

## License

MIT
