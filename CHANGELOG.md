# Changelog

## 1.0.0

First stable release: the `skill-healthcheck` CLI and the `dsh-skill-healthcheck` plugin for DeepSeek Harness.

**Checks**
- Local silent failures, mirroring dsh 0.2.x rules exactly: invalid frontmatter (skill dropped), same-name shadowing by root rank, skills nested too deep to be discovered, skills in directories the platform doesn't scan, descriptions truncated by the 500-character catalog limit.
- Upstream liveness over git (any host): up to date / changed / moved or renamed / deleted in the repo / repository gone / repository moved. Network failures are never reported as deletions.
- Change impact: description changes (with removed/added words, language and tone rules), name changes (`/old-name` stops working), invocation policy changes, new or changed `scripts/`, catalog truncation, body growth in tokens, platform-specific syntax for the current OS. Calibrated on 74 real changes from 15 public repos (`research/EVAL.md`).
- dsh plugins: host-version compatibility (`engines.dsh` / peers), version exemptions, upgrades on npm that support the current host, deprecations.

**Recording and attribution**
- Journal from the first run: snapshot diffs plus every `SKILL.md` version in a content-addressed store. Project-level skills are kept per project, so running in another project, or from a folder without `.git`, never looks like deletions. Snapshots and caches are written atomically, so the CLI and the dsh plugin can run at the same time.
- Backfill from session logs of dsh, Claude Code (`~/.claude/projects`, using its per-skill catalog digests) and Codex (`~/.codex/sessions`): the catalog the model saw over time, skill invocations, per-day language of replies. Logs older than 180 days are skipped.
- `why "<symptom>"`: ranks suspects by symptom lexicon, time proximity and behavior change points. Deterministic, no LLM.
- Optional `--explain`: one plain sentence per upstream change and for the top `why` suspect, from Claude (official SDK, `claude-opus-5-5`, low effort, server-side fallback), DeepSeek, or any OpenAI-compatible endpoint. Off by default; sends skill text only; cached; never affects verdicts.

**Platforms**
- dsh: exact scan order, parsing and catalog limit, plugin and host checks.
- Claude Code and Codex: each agent's own skill roots (from their sources), so a skill installed for both is not a conflict; same-name copies within one agent are reported as a conflict.

**Commands**: `check` (default), `why`, `log`, `ls` (including skills registered by dsh plugins at runtime), `adopt <name> <source>`, `adopt --repo <repo>` (bulk, by name and content), `record`; `--json`, `--offline`, `--all`, `--lang zh|en`, `--explain`. Exit codes: 0 healthy, 1 broken, 2 usage error. Finding codes are stable and documented in `docs/findings.md`.

**Languages**: every message in Chinese and English from one typed catalog; the language follows the system locale unless `--lang` or `SKILL_HEALTHCHECK_LANG` says otherwise. User data is never translated, and `--json` uses the same language as the screen.

**dsh plugin** (`dsh-skill-healthcheck`): records on host startup and on `skills/change`, adds `/skill-healthcheck [why <symptom> | log | ls]`. Verified by loading it in a real dsh 0.2.1 runtime.

**Security**
- Upstream addresses from `metadata.source` are untrusted: option injection (`--upload-pack=…`), `ext::` transports and relative paths are refused; git runs with prompts disabled and `--end-of-options`.
- Package names passed to `npm view` are validated.
