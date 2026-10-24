# skill-healthcheck

English | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <a href="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml"><img src="https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://www.npmjs.com/package/skill-healthcheck"><img src="https://img.shields.io/npm/v/skill-healthcheck?color=blue" alt="npm version"></a>
  <img src="https://img.shields.io/badge/node-22.19%2B-brightgreen" alt="Node 22.19+">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/platforms-linux%20%7C%20macos%20%7C%20windows-lightgrey" alt="Linux, macOS, Windows">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs welcome">
</p>

<p align="center"><b>Find agent skills that silently stopped working, and when your agent's behavior changed.</b><br>Claude Code · Codex · DeepSeek Harness</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.png" alt="skill-healthcheck: one checkup flags a skill whose upstream description changed" width="900">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/lijiaqi-AI-Product-Manager/skill-healthcheck/main/docs/demo.gif" alt="skill-healthcheck demo: a skill's description changes upstream, and why attributes the behavior change" width="900">
</p>

> Has your agent gotten dumber lately? It might be the skill you installed three weeks ago.

When a plugin breaks, you know immediately: it won't install, it throws errors, it vanishes from the UI. **When a skill breaks, you never find out**: `SKILL.md` is still on disk, everything looks normal, and the model simply stops using it. The upstream may have changed the `description`, renamed the skill, deleted the repo — or a local skill with the same name is shadowing it. All you notice is that "the agent stopped listening" or "it doesn't answer in Chinese anymore", and then you go blame the model and your prompts.

`skill-healthcheck` answers one question:

**Is what I installed still working? Which piece broke, and when did it start?**

One command, one checkup, one screen of output. Read-only, and it never updates anything by itself.

```text
$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:27
Host     dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  +1 bundle
Skills   2: 2 ok · 0 updated upstream · 0 broken
Summary: everything still works; nothing for you to do
Recording started (2 entries). Every run from now on records what changed.

$ skill-healthcheck
skill-healthcheck · DeepSeek Harness · profile desktop · 2026-10-23 20:27
Host     dsh 0.2.1-rc.2 ✓
Plugins  0: 0 ok · 0 upgradable · 0 broken  +1 bundle
Skills   2: 1 ok · 1 updated upstream · 0 broken
      ↑ zh-writer        upstream changed the description: removed "Chinese" "paragraphs" "rewritten"; added "professional" "marketing" "posts"  ⚠ critical
Summary: 1 skill needs your review, one by one

$ skill-healthcheck why "stopped replying in Chinese"
why "stopped replying in Chinese" → Reply language changed (no longer Chinese / mixed languages)
Onset: share of Chinese in replies: ~100% before 2026-10-19, 0% that day (you kept asking in Chinese)
1. doc-writer           the description the model sees changed on 2026-10-19
     adds "professional tone"
     adds "Always respond in English"
     removed "structured" "clearly"
Ranked by time and keywords, not a verdict. Disable #1 first to confirm.
```

Output follows your system language; `--lang zh` or `--lang en` picks one.

(The output above is from a real `npm run demo` run: both skills come from local git repos, and the session log is synthetic.)

## Install

Requires Node.js 22.19+ and git. Try it without installing:

```bash
npx skill-healthcheck
```

Or install it:

```bash
npm install -g skill-healthcheck
```

From source:

```bash
git clone https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck && cd skill-healthcheck && npm install && npm run build && npm link
```

In mainland China the npmmirror mirror usually installs faster: add `--registry=https://registry.npmmirror.com` to either command.


## Usage

| Command                                   | What it does                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `skill-healthcheck`                       | One-screen checkup: host, plugins, skills                                                                                     |
| `skill-healthcheck why "<symptom>"`       | Work backward along the timeline to suspicious skills, e.g. `why "不用中文回答了"`; also accepts `--since 2026-10-01`         |
| `skill-healthcheck log`                   | Journal of what was installed, what changed, and when (`~` marks times estimated from file mtimes)                            |
| `skill-healthcheck ls`                    | Which skills the platform will actually load, which are shadowed, which are dropped                                           |
| `skill-healthcheck adopt --repo <repo>`   | Register sources in bulk: match local skills to the repo's skills by name and content, e.g. `--repo github:anthropics/skills` |
| `skill-healthcheck adopt <name> <source>` | Register one skill's source: `github:owner/repo/path`, a GitHub URL, or `<git-url>#<path>`                                    |
| `skill-healthcheck record`                | Record a single snapshot (for hooks and scheduled jobs)                                                                       |

Common options: `--all` expand everything, `--json` machine-readable, `--offline` no network, `--no-sessions` skip session logs, `--lang zh|en` output language (defaults to your system locale; also `SKILL_HEALTHCHECK_LANG`), `--explain` one plain-language sentence per upstream change (see below), `--platform dsh|generic`, `--profile <name>`, `--cwd <project dir>`.

Exit codes: `0` all good (available updates count as good), `1` something is broken (including dropped, shadowed, or too-deeply-nested skills and broken plugins), `2` usage error, `3` the tool itself failed. Drop it straight into CI. Every finding has a stable code for `--json` consumers: [docs/findings.md](docs/findings.md).

Copied your skills over without their `.git`? Run `skill-healthcheck adopt --repo <the repo they came from>` once so upstream checks can work. Skills whose folder was renamed are matched by content.

## Inside DeepSeek Harness

The companion plugin [`dsh-skill-healthcheck`](packages/dsh-skill-healthcheck) runs inside dsh:

- it records a snapshot every time dsh starts, and again whenever dsh reports that the skill catalog changed, so the journal has no gaps while you work;
- it adds `/skill-healthcheck` to the chat: the same one-screen checkup, plus `why <symptom>`, `log` and `ls`.

Install it from the Plugins page in dsh, or:

```bash
dsh plugin --profile desktop add dsh-skill-healthcheck
```

## With Claude Code and Codex

Without dsh, `skill-healthcheck` runs in generic mode. It reads the skills each agent actually loads, with that agent's own rules:

- **Claude Code** (from its documentation): `~/.claude/skills`, `~/.claude/skills/synced`, and `.claude/skills` in every folder from where you start up to the repo root. Names don't need to be kebab-case, a missing description falls back to the body's first line, and a broken frontmatter loads with no fields, which is reported because the model then never sees the description. Personal skills win over project skills.
- **Codex** (from its source): `.agents/skills` from the repo root down to where you start, `.codex/skills`, `~/.agents/skills`, `$CODEX_HOME/skills`, up to six folders deep. A description is required; same-name skills are both listed to the model.

It also backfills history from their session logs (`~/.claude/projects`, `~/.codex/sessions`): the skill catalog the model saw over time, every skill call, and the language of replies. So `why` works there too. A skill installed for both agents is not a conflict.

Claude Code plugin skills (`/plugin:skill`) are installed and updated by Claude Code's plugin manager, so they aren't scanned or checked upstream; their description changes still reach `why` through the session logs.

To keep the journal going on its own, record at the start of every Claude Code session with a hook in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "skill-healthcheck record" }] }]
  }
}
```

For Codex, run `skill-healthcheck record` from cron or Task Scheduler once a day.

## Optional: `--explain`

`--explain` adds one plain sentence under each upstream change ("it will no longer be picked for Chinese writing"), and under the top `why` suspect. It's off by default and never changes a verdict. It uses whichever you have:

| Environment | Provider |
|---|---|
| `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) | Claude, `claude-opus-5-5` at low effort, through the official SDK, with server-side fallback on refusals |
| `DEEPSEEK_API_KEY` | DeepSeek, `deepseek-chat` |
| `SKILL_HEALTHCHECK_LLM_BASE_URL` + `SKILL_HEALTHCHECK_LLM_API_KEY` | any OpenAI-compatible endpoint (Ollama, vLLM, …) |

`SKILL_HEALTHCHECK_LLM` picks one explicitly and `SKILL_HEALTHCHECK_LLM_MODEL` changes the model. Only the skill's before/after text and the detected words are sent, never session logs. Skill text is fenced as untrusted data, replies are cut to one line, and answers are cached.

## What it checks

**Skills: local (offline, deterministic)**

| Problem                                                                                         | Why it fails silently                                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Invalid frontmatter                                                                             | dsh and Codex drop the whole skill; Claude Code loads it with no description, so the model never picks it   |
| Shadowed by a same-name skill                                                                   | dsh lets the project copy win, Claude Code the personal one; Codex lists both and the model may pick wrong  |
| Nested too deep                                                                                 | dsh and Claude Code only read `<root>/<name>/SKILL.md`; clone a whole skill repo in there and none load     |
| Wrong directory                                                                                 | dsh doesn't scan `~/.claude/skills` or `~/.codex/skills`                                                    |
| description over the catalog limit                                                              | dsh cuts it at 500 characters, Codex at 1,024, Claude Code at 1,536: the trigger words at the end are lost  |
| Used to be invoked often, then one day never again                                              | Evidence from the session log beats any inference                                                           |

**Skills: upstream (git, any hosting platform)**

| Upstream change                           | Impact                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `description` changed                     | ⚠ Highest risk: the trigger conditions changed and the skill may never be invoked again. It lists the words removed and added, and flags language/tone rules |
| `name` changed / directory moved          | The `/old-name` entry point stops working; it tells you the new one                                                                                          |
| Repo deleted / skill deleted              | Your local copy is now unmaintained (only an explicit 404 counts as deleted; network failures report "couldn't check")                                       |
| New executable in `scripts/`              | A human needs to review the code                                                                                                                             |
| description grew longer or over the limit | It gets truncated, or takes up more context on every turn                                                                                                    |
| Body grew                                 | How many extra tokens each invocation takes (the body loads on demand, so it doesn't crowd out other skills)                                                 |
| New platform-specific syntax              | PowerShell cmdlets, `brew`, `/usr/bin`, for example — it may not run on your system                                                                          |

**Plugins (dsh)**: whether the plugins installed in a profile are compatible with the current dsh version (`engines.dsh` / peerDependencies), whether they run on a version exemption, whether npm has a newer release, and whether the author has deprecated them.

**The summary line is deliberately asymmetric**: `插件 2 个可一键升级；技能 3 个需你逐个确认` ("2 plugins can be upgraded in one click; 3 skills need you to review them one by one"). Plugins are npm packages with version numbers and rollbacks; skills are prompts — overwrite one and the old version is gone, and if its behavior changed you wouldn't know. So a human has to look.

## Attribution: `why`

The tool starts journaling from its very first run (`~/.skill-healthcheck/journal.jsonl`): what was installed, what changed, what was deleted, with the full text of every version of every `SKILL.md`. `why` combines that journal with the agent's own session logs (which contain the skill catalog the model saw each time, in order) to rank the suspects:

- **Symptom lexicon**: maps "it stopped answering in Chinese" to language rules (`respond in English`, `professional tone`, `默认使用英文`, …)
- **Time**: changes closer to when the symptom started are more suspicious; changes that happened after it are down-weighted
- **Behavior change point**: computes the share of Chinese replies and the skill invocation counts from session logs to find the day the change began

All of it is deterministic code with no LLM calls, so results are stable and testable.

## Validated on real data

We collected 74 real `SKILL.md` changes from 15 public skill repositories (anthropics/skills, obra/superpowers, vercel-labs/agent-skills, deepseek-ai/deepseek-harness, among others) and ran the rules over every one of them:

| Change type         | Reported / actual |
| ------------------- | ----------------: |
| description changed |           44 / 44 |
| name changed        |           18 / 18 |
| directory moved     |           20 / 20 |
| scripts added       |           13 / 13 |

In this dataset, 37 upstream changes removed words that had been in the description, 16 renamed the skill, and 3 produced a new version that dsh drops outright. The dataset, reproduction steps, and rule tuning are in [research/EVAL.md](research/EVAL.md).

## Data and privacy

- Reads your skill directories, dsh profiles, and session logs; writes nothing outside `~/.skill-healthcheck/`.
- Session logs are read locally only, and only derived data is cached (skill catalog, invocation counts, daily share of Chinese replies). Conversation text is never stored.
- Upstream checks run in separate bare repos under `~/.skill-healthcheck/cache/`; it never fetches into or modifies your own skill repos.
- `metadata.source` in a skill's frontmatter is written by a third party, so it's treated as untrusted: only https/ssh/git/file URLs and absolute paths are accepted, option injection such as `--upload-pack=…` and transports such as `ext::` are refused, and git never prompts for credentials.
- Network access does exactly three things by default: `git fetch` skill upstreams, ask the GitHub API whether a repo still exists, and `npm view` for plugin versions. `--offline` turns all of it off. `--explain` adds a fourth, only when you pass it: the skill's before/after text goes to the LLM provider you configured.
- Session logs older than 180 days are skipped (`SKILL_HEALTHCHECK_SESSION_DAYS` changes that). To forget everything, delete `~/.skill-healthcheck/`.

## Platform support

| Platform                                        | Level of support                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| DeepSeek Harness (dsh)                          | Full: mirrors dsh's scan order and parsing rules, backfills session logs, checks plugins and the host |
| Claude Code and Codex (generic mode)            | Each agent's own skill roots and parsing rules, local plus upstream checks, session-log backfill      |

It switches to dsh mode automatically when `~/.dsh/profiles` is detected; you can also set it with `--platform`.

## How a skill's source is determined

Agents don't record where a skill was installed from, so it tries these in order, and says "source unknown" instead of guessing:

1. A source registered with `skill-healthcheck adopt`
2. `metadata.source` in the frontmatter
3. The skill directory is a git checkout → use its `origin`

## Development

```bash
npm install
npm test        # vitest: parsing, discovery, journal, impact rules, upstream (local bare repos), attribution, i18n, dsh plugin
npm run demo    # 15-second demo, runs entirely inside demo/.sandbox
node scripts/corpus-eval.mjs   # run the impact rules over 74 real changes (build first; fetches files from GitHub)
```

## Roadmap

- [x] Journal, local silent-failure checks, session-log backfill
- [x] Upstream liveness checks and change-impact assessment
- [x] `why` attribution
- [x] Plugin compatibility and upgrade checks (dsh)
- [x] dsh plugin `dsh-skill-healthcheck`: records on host startup and on catalog changes, adds `/skill-healthcheck`
- [x] Chinese and English output (`--lang`)
- [x] Optional `--explain`: one plain sentence per change from Claude, DeepSeek or any OpenAI-compatible model
- [x] Session-log backfill for Claude Code and Codex

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. For security issues use [SECURITY.md](SECURITY.md) instead of a public issue.

## License

MIT
