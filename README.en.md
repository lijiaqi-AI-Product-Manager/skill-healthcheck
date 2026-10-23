# skill-healthcheck

English | [中文](README.md)

> Your agent got dumber lately? Blame the skill you installed three weeks ago.

When a plugin breaks, you know immediately: it won't install, it throws errors, it vanishes from the UI. **When a skill breaks, you never find out**: `SKILL.md` is still on disk, everything looks normal, and the model simply stops using it. The upstream may have changed the `description`, renamed the skill, deleted the repo — or a local skill with the same name is shadowing it. All you notice is that "the agent stopped listening" or "it doesn't answer in Chinese anymore", and then you go blame the model and your prompts.

`skill-healthcheck` answers one question:

**Is what I installed still working? Which piece broke, and when did it start?**

One command, one checkup, one screen of output. Read-only, and it never updates anything by itself.

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

(The tool's output is currently in Chinese; English output is on the roadmap.)

(The output above is from a real `npm run demo` run: both skills come from local git repos, and the session log is synthetic.)

## Install

Requires Node.js 22.19+ and git.

```bash
npm install -g skill-healthcheck
```

If it isn't on npm yet, install from source:

```bash
git clone <this repo> && cd skill-healthcheck && npm install && npm run build && npm link
```

## Usage

| Command | What it does |
|---|---|
| `skill-healthcheck` | One-screen checkup: host, plugins, skills |
| `skill-healthcheck why "<symptom>"` | Work backward along the timeline to suspicious skills, e.g. `why "不用中文回答了"`; also accepts `--since 2026-10-01` |
| `skill-healthcheck log` | Journal of what was installed, what changed, and when (`~` marks times estimated from file mtimes) |
| `skill-healthcheck ls` | Which skills the platform will actually load, which are shadowed, which are dropped |
| `skill-healthcheck adopt <name> <source>` | Register a skill's source: `github:owner/repo/path`, a GitHub URL, or `<git-url>#<path>` |
| `skill-healthcheck record` | Record a single snapshot (for hooks and scheduled jobs) |

Common options: `--all` expand everything, `--json` machine-readable, `--offline` no network, `--no-sessions` skip session logs, `--platform dsh|generic`, `--profile <name>`, `--cwd <project dir>`.

`check` exits with code 1 when it finds broken items, so it fits into CI.

## What it checks

**Skills: local (offline, deterministic)**

| Problem | Why it fails silently |
|---|---|
| Invalid frontmatter (name isn't kebab-case, a boolean is misspelled, an old field name is used) | dsh drops the entire skill and only logs a single warning line |
| Shadowed by a same-name skill | A skill of the same name under the project-level `.dsh/skills` shadows the one you installed globally |
| Nested too deep | Only `<root>/<name>/SKILL.md` is recognized; clone a whole skill repo in there and none of them take effect |
| Wrong directory | dsh doesn't scan `~/.claude/skills` or `~/.codex/skills` |
| description over 500 characters | It gets truncated in the catalog, so the model never sees the trigger words at the end |
| Used to be invoked often, then one day never again | Evidence from the session log beats any inference |

**Skills: upstream (git, any hosting platform)**

| Upstream change | Impact |
|---|---|
| `description` changed | ⚠ Highest risk: the trigger conditions changed and the skill may never be invoked again. It lists the words removed and added, and flags language/tone rules |
| `name` changed / directory moved | The `/old-name` entry point stops working; it tells you the new one |
| Repo deleted / skill deleted | Your local copy is now unmaintained (only an explicit 404 counts as deleted; network failures report "couldn't check") |
| New executable in `scripts/` | A human needs to review the code |
| description grew longer or over the limit | It gets truncated, or takes up more context on every turn |
| Body grew | How many extra tokens each invocation takes (the body loads on demand, so it doesn't crowd out other skills) |
| New platform-specific syntax | PowerShell cmdlets, `brew`, `/usr/bin`, for example — it may not run on your system |

**Plugins (dsh)**: whether the plugins installed in a profile are compatible with the current dsh version (`engines.dsh` / peerDependencies), whether they run on a version exemption, whether npm has a newer release, and whether the author has deprecated them.

**The summary line is deliberately asymmetric**: `插件 2 个可一键升级；技能 3 个需你逐个确认`. Plugins are npm packages with version numbers and rollbacks; skills are prompts — overwrite one and the old version is gone, and if its behavior changed you wouldn't know. So a human has to look.

## Attribution: `why`

The tool starts journaling from its very first run (`~/.skill-healthcheck/journal.jsonl`): what was installed, what changed, what was deleted, with the full text of every version of every `SKILL.md`. `why` combines that journal with dsh's own session logs (which contain the skill catalog the model saw each time, in order) to rank the suspects:

- **Symptom lexicon**: maps "it stopped answering in Chinese" to language rules (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Time**: changes closer to when the symptom started are more suspicious; changes that happened after it are down-weighted
- **Behavior change point**: computes the share of Chinese replies and the skill invocation counts from session logs to find the day the change began

All of it is deterministic code with no LLM calls, so results are stable and testable.

## Validated on real data

We collected 74 real `SKILL.md` changes from 15 public skill repositories (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness, among others) and ran the rules over every one of them:

| Change type | Reported / actual |
|---|---:|
| description changed | 44 / 44 |
| name changed | 18 / 18 |
| directory moved | 20 / 20 |
| scripts added | 13 / 13 |

In this dataset, 37 upstream changes removed words that had been in the description, 16 renamed the skill, and 3 produced a new version that dsh drops outright. The dataset, reproduction steps, and rule tuning are in [research/EVAL.md](research/EVAL.md).

## Data and privacy

- Reads your skill directories, dsh profiles, and session logs; writes nothing outside `~/.skill-healthcheck/`.
- Session logs are read locally only, and only derived data is cached (skill catalog, invocation counts, daily share of Chinese replies). Conversation text is never stored.
- Upstream checks run in separate bare repos under `~/.skill-healthcheck/cache/`; it never fetches into or modifies your own skill repos.
- Network access does exactly three things: `git fetch` skill upstreams, ask the GitHub API whether a repo still exists, and `npm view` for plugin versions. `--offline` turns all of it off.

## Platform support

| Platform | Level of support |
|---|---|
| DeepSeek Harness (dsh) | Full: mirrors dsh's scan order and parsing rules, backfills session logs, checks plugins and the host |
| Generic Agent Skills (Claude Code, Codex, etc.) | Scans `.agents/skills`, `.claude/skills`, `~/.codex/skills` and runs local plus upstream checks |

It switches to dsh mode automatically when `~/.dsh/profiles` is detected; you can also set it with `--platform`.

## How a skill's source is determined

dsh itself doesn't record where a skill was installed from, so it tries these in order, and says "source unknown" instead of guessing:

1. A source registered with `skill-healthcheck adopt`
2. `metadata.source` in the frontmatter
3. The skill directory is a git checkout → use its `origin`

## Development

```bash
npm install
npm test        # vitest：解析规则、发现规则、记录器、影响规则、上游（本地裸仓库）、归因、词典
npm run demo    # 15 秒演示，全部在 demo/.sandbox 里进行
node scripts/corpus-eval.mjs   # 在 74 条真实变更上跑影响规则（需要先 build，会联网取文件）
```

## Roadmap

- [x] Journal, local silent-failure checks, session-log backfill
- [x] Upstream liveness checks and change-impact assessment
- [x] `why` attribution (minimal version)
- [x] Plugin compatibility and upgrade checks (dsh)
- [ ] dsh plugin shell `dsh-skill-healthcheck`: record on host startup, watch skill changes, expose `/skill-healthcheck`
- [ ] Optional `--explain`: use an LLM to turn the diff into one plain sentence (off by default)

## License

MIT
