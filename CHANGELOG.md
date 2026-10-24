# Changelog

## 1.1.1

Correctness release from an external review of 1.1.0. Three of the fixes are about promises
the tool makes: `--explain` sends skill text only, `--offline` covers every command, and a
failed read is never reported as a deletion.

**Fixed**
- **`why --explain` no longer sends the user's complaint to the LLM.** Only the before/after
  skill text, the detected words and the finding codes are sent, as the README and SECURITY.md
  always said.
- **`adopt --repo` honours `--offline`** and creates no cache; `UpstreamChecker.fetchRepo`
  refuses to fetch when offline, for every command.
- **Authentication failures are not deletions.** A private GitHub repository that can't be
  authenticated is reported as `unreachable` with an auth hint, never as `repo-missing`, and
  the anonymous API's 404 is no longer used to confirm it. The generic `not found` match was
  narrowed so `git-upload-pack: command not found` is not a missing repository either.
- **A moved skill whose new path can't be read** reports `unreachable`, not `removed-upstream`;
  the same is true when the data directory is read-only and the cache can't be created.
- **`adopt --repo` maps one upstream path to one local skill.** Similar skills used to claim
  the same folder and persist a wrong provenance for all of them.
- **`went-quiet` only goes critical when the quiet sessions come after the change.** Three
  quiet sessions before a description edit no longer count as evidence that the edit caused
  the silence.
- **Unreadable roots are reported (`scan-error`, high).** A permission or I/O failure no
  longer looks like "this directory has no skills", so the check can't silently pass.
- **Catalog truncation vs. a real edit**: a short `Write docs` → `Write docs. Always respond
  in English` is a change again; only an ellipsis-marked cut or a cut near a catalog cap is
  treated as truncation.
- **`scripts-removed`** is a finding (medium) instead of falling back to `upstream-minor`.
- **CRLF scripts are not "changed"** when the repository stores CRLF: the raw and LF blob
  hashes are both accepted.
- **Path identity**: a cross-drive `relative()` on Windows is "unknown" instead of a fake
  subpath; project snapshot partitions case-fold only on Windows/macOS; `findGitRoot` resolves
  symlinks before walking up.
- **URLs are redacted in query values too** (`?access_token=…`), progress lines included.
- **`ls` and `log` sanitize names and paths** like the rest of the report; C1 controls are
  stripped as well as C0.
- **zstd session output is capped** (512 MB) instead of decompressing without a bound.
- **`why` journal evidence includes lost signals**: removing a rule in a skill the journal
  recorded is now evidence, not silence.
- **`docs/findings.md`**: exit code 1 also covers `high` findings; `scan-error` and
  `scripts-removed` documented.

**Changed**
- The repository moved to `github.com/lijiaqi-AI-Product-Manager/skill-healthcheck`. Every
  URL in the READMEs, package metadata, security policy, contribution guide and issue
  templates points at the new owner.

## 1.1.0

Claude Code and Codex now get their own rules. Until 1.0.2, generic mode read their skills
with dsh's parser, so a Claude Code skill named `My_Skill` or one without frontmatter was
reported as "silently dropped" (exit 1) although Claude Code loads it, and Codex skills a few
folders deep were reported as nested although Codex walks the tree.

**Fixed**
- **Claude Code**, from its documented rules: any name without refused characters is valid;
  `name` falls back to the folder and `description` to the body's first line; a frontmatter
  that doesn't parse loads with no fields instead of being dropped; booleans accept
  yes/no/on/off/1/0; personal skills win over project skills (the reverse was reported);
  project skills come from `.claude/skills` in every folder from the start directory up to
  the repo root; `~/.claude/skills/synced` (claude.ai sync) is read and `.trash` is not;
  loose `.md` files in a skills folder are not skills.
- **Codex**, mirroring codex-rs: skills are found up to six folders deep with hidden folders
  skipped; `name` falls back to the folder and is capped at 64 characters; `description` is
  required; `key: prose: with colons` is repaired the way Codex does; same-name skills are
  reported as "both listed", not as one shadowing the other.
- Catalog limits per agent: Claude Code 1,536 characters (description plus `when_to_use`),
  Codex 1,024. Only dsh's 500 was known before, so truncation went unreported elsewhere.
- Upstream comparison reads the new version with the skill's own agent rules and folder
  name, so a name-less Claude Code skill is not reported as renamed when the upstream folder
  differs from yours.
- Word stems: `change`/`changed`/`changing` and `use`/`used` now compare equal, so rewording
  is not reported as a removed trigger word.

**New finding codes**
- `frontmatter-ignored` (critical, Claude Code): broken YAML, so the model never sees the
  description; only `/name` works.
- `no-description` (medium, Claude Code): no description, so the body's first line is used.

**Changed**
- The skills line counts a skill with no known upstream as working, and says how many were
  not checked upstream: a skill you wrote yourself has no upstream to check. The footer says
  `adopt --repo` is for skills installed from a git repo.
- `actions/checkout` and `actions/setup-node` v7; `@anthropic-ai/sdk` 0.136. Dependabot no
  longer proposes major bumps of `@types/node` (it must match Node 22) or TypeScript.
- `package-lock.json` matches `package.json` again (the 1.0.2 lock still listed the SDK as a
  regular dependency).

## 1.0.2

Correctness release, driven by six independent external reviews of 1.0.1. Most of these were
wrong *conclusions* rather than crashes: a false "deleted upstream", a false "repo gone", a
permanent "changed" for adopted skills, and a session scanner that skipped project folders
with a dot in the name.

**Fixed**
- **Node < 22.15 no longer dies on startup.** `zstdDecompressSync` was a static import, so
  `npx skill-healthcheck --version` raised `SyntaxError` on Node 22.13/22.14 before anything
  ran. It is now read off the `node:zlib` namespace, and the CLI checks `engines` itself and
  prints one line with the current version instead of an ESM stack trace.
- **A renamed-and-rewritten skill is no longer reported as deleted.** git's own rename
  detection (`git show --name-status -M`) runs before the content-similarity fallback, so
  `removed-upstream` is reserved for paths that really left the repository.
- **A failed `git show` is no longer treated as a deletion.** Blob fetches that fail in a
  blobless clone now report `upstream-unreachable`, not "your copy is unmaintained".
- **A missing local `metadata.source` no longer fails CI.** A third-party typo is reported as
  `upstream-unreachable`; a local repository you registered yourself with `adopt` still counts
  as gone.
- **`metadata.source` no longer causes a permanent "upstream changed".** Comparison falls back
  to the parsed skill (name, description, invocation, body) when only frontmatter metadata
  differs, which is the field the README tells you to add.
- **Session logs under `ws.v2` / `my.project` are found again.** The walker skipped every
  directory whose name contained a dot; it now skips only `node_modules`, `.git` and `.cache`.
- **`went-quiet` no longer blames a description that changed after the skill went unused.** The
  change must sit around the last call (old text still listed then, new text within two weeks).
- **A swapped platform command is reported.** `Get-ChildItem` → `Get-Process` used to be
  deduplicated away by rule id; deduplication now compares the matched text.
- **`description-grew` is checked on every platform**, not only where a catalog limit is known.
- **BOM-prefixed `SKILL.md` files are valid.** Windows editors write a BOM; it is no longer a
  critical "missing frontmatter".
- **Word-form edits are not lost triggers.** `running`/`run`, `copies`/`copy`, `articles`/`article`
  fold to the same stem.
- **`ssh://-oProxyCommand=…` is rejected**, like other option-shaped hosts.
- **Credential-bearing URLs are redacted** in `--json`, `adopt` output and error details.
- Case folding for path identity now happens only on Windows and macOS.

**Changed**
- `--json` has `schemaVersion: 1` and `pluginFindings` (documented in `docs/findings.md` but
  previously missing from the output). `docs/findings.md` now ships in the tarball.
- Exit code `3` for an internal failure; `2` stays "usage error". All eight READMEs, `--help`
  and `docs/findings.md` document it.
- `@anthropic-ai/sdk` moved to `optionalDependencies`: `--explain` already loaded it lazily, and
  `npm install --omit=optional` now skips it entirely. A plain install still includes it,
  because npm installs optional dependencies by default.
- The journal directory is created `0700` and its files `0600`.
- A read-only data directory no longer turns into exit 3: the check prints its findings with
  a warning line, `--json` gains `journalError`, and the exit code still reflects the result.
- One `git rev-parse` per checkout instead of one per skill, and a single pass over session
  calls instead of one per skill.
- CI now pins Node 22.19.0 (the declared minimum) and runs a Node 22.13.1 job that asserts the
  friendly message.

**Data**
- The symptom lexicon gains Chinese-direction skill signals (`respond in Chinese`, `用中文回答`,
  …) and a "lost signal" path in `why`: dropping a language pin is now evidence, not silence.
  New complaint phrasings ("它现在怎么不回复中文了", "它不再调用我的技能了", "回答太长了我受不了")
  match their symptoms.

## 1.0.1

Maintenance release: no change to how any check behaves.

**Packaging**
- The published tarball now ships only `dist` plus the changelog; every `README.*.md`, `LICENSE` and `package.json` are still included automatically.
- `prepare` is set, so installing straight from the repository (`npm install github:lijiaqi-AI-Product-Manager/skill-healthcheck`) builds the CLI instead of failing on a missing `dist/cli.js`.
- `vitest` moved from 3.2.7 to 5.0.5; the dependency audit is now clean.

**Developer experience**
- Test timeout raised to 30 s: the git-backed tests spawn real repositories and the Windows CI runners routinely exceeded the 5 s default.
- Added `.gitattributes` (LF everywhere, CRLF only for PowerShell), `.editorconfig`, `.nvmrc`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and pull-request templates, and a weekly Dependabot config.
- `--help` documents `--name` (filter `log` by skill) and `--force` (overwrite sources with `adopt --repo`), in both languages.

**Docs**
- A static one-screen screenshot sits above the demo GIF, so the first thing you see renders instantly.
- A 1280×640 social preview card lives in `docs/social-preview.png`.
- The install section mentions the npmmirror registry for users in mainland China, and the READMEs link to `CONTRIBUTING.md` and `SECURITY.md`.
- An npm version badge in all eight READMEs; the repository homepage points at the npm page.

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
