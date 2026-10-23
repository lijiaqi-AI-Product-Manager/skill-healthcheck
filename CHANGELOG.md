# Changelog

## 0.1.0 — unreleased

First release.

**Checks**
- Local silent failures, mirroring dsh 0.2.x rules exactly: invalid frontmatter (skill dropped), same-name shadowing by root rank, skills nested too deep to be discovered, skills in directories the platform doesn't scan, descriptions truncated by the 500-character catalog limit.
- Upstream liveness over git (any host): up to date / changed / moved or renamed / deleted in the repo / repository gone / repository moved. Network failures are never reported as deletions.
- Change impact: description changes (with removed/added words, language and tone rules), name changes (`/old-name` stops working), invocation policy changes, new or changed `scripts/`, catalog truncation, body growth in tokens, platform-specific syntax for the current OS. Calibrated on 74 real changes from 15 public repos (`research/EVAL.md`).
- dsh plugins: host-version compatibility (`engines.dsh` / peers), version exemptions, upgrades on npm that support the current host, deprecations.

**Recording and attribution**
- Journal from the first run: snapshot diffs plus every `SKILL.md` version in a content-addressed store.
- Backfill from dsh session logs: the catalog the model saw over time, skill invocations, per-day language of replies.
- `why "<symptom>"`: ranks suspects by symptom lexicon, time proximity and behavior change points. Deterministic, no LLM.

**Commands**: `check` (default), `why`, `log`, `ls`, `adopt <name> <source>`, `adopt --repo <repo>`, `record`; `--json`, `--offline`, `--all`.

**Security**
- Upstream addresses from `metadata.source` are untrusted: option injection (`--upload-pack=…`), `ext::` transports and relative paths are refused; git runs with prompts disabled and `--end-of-options`.
- Package names passed to `npm view` are validated.
