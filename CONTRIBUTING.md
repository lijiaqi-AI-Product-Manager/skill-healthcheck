# Contributing to skill-healthcheck

Thanks for taking the time to contribute. This document covers the practical bits: how to run the project, what a good change looks like, and where the moving parts live.

## Prerequisites

- Node.js **22.19+** (the same floor the published package declares in `engines`)
- git on your `PATH` — the upstream checks run real `git` commands

## Get set up

```bash
git clone https://github.com/lijiaqi-AI-Product-Manager/skill-healthcheck
cd skill-healthcheck
npm ci
npm run build
npm test
```

`npm test` runs the whole suite (unit tests plus integration tests that spin up local bare git repos). On a slow Windows runner the git-backed tests can take a while; `vitest.config.ts` allows 30 s per test for exactly that reason.

Want to see the tool do something before reading the code?

```bash
node demo/run.mjs          # 15-second scripted demo inside demo/.sandbox
node demo/run.mjs --fast   # no pauses
node demo/run.mjs --lang zh
```

The demo writes only inside `demo/.sandbox` and sets `SKILL_HEALTHCHECK_USER_HOME`, so it never touches your real `~/.dsh` or `~/.skill-healthcheck`.

## Where things live

| Path | What it does |
|---|---|
| `src/cli.ts` | argument parsing, command dispatch, exit codes |
| `src/check.ts` | the `check` pipeline: scan → verdicts → findings |
| `src/discover.ts` | skill roots, shadowing, nesting, catalog order |
| `src/frontmatter.ts` | `SKILL.md` parsing and the 500-character catalog rule |
| `src/upstream.ts` | provenance, bare-repo cache, git safety, impact detection |
| `src/impact.ts` | what a change means for the user (description, name, scripts, body) |
| `src/why.ts` | symptom matching, timeline ranking, behavior change points |
| `src/sessions.ts` | dsh / Claude Code / Codex session-log readers |
| `src/report.ts` | all screen output; `src/i18n.ts` holds the message catalog |
| `src/journal.ts` | snapshot store and atomic writes |
| `src/explain.ts` | the optional `--explain` LLM bridge |
| `docs/findings.md` | stable finding codes for `--json` consumers |
| `research/` | the change corpus and the evaluation write-up |

## What a good change looks like

- **Tests first.** Every behavior change should come with a test that fails before it and passes after. Aim for the test to exercise the real path (a temp directory, a local bare repo) rather than mocking `git`.
- **Keep output deterministic.** No network in the default path, no LLM calls outside `--explain`, no timestamps in anything that gets compared in tests.
- **Don't break `--json`.** Finding codes in `docs/findings.md` are a public contract; add new ones rather than renaming existing ones.
- **Both languages.** User-facing text goes through `src/i18n.ts` with a Chinese and an English string. `--lang` and `SKILL_HEALTHCHECK_LANG` must both keep working.
- **Exit codes stay honest.** `0` healthy, `1` something locally broken, `2` usage error, `3` the tool itself failed. Upstream findings do not set `1` on their own: a `critical` description change is advisory because the tool cannot know whether it still triggers for you. Keep the `severity` honest and let the caller decide.

## Translations

`README.md` (English) is the source of truth; `README.zh.md` and the other six are translations of it.

If you change the English README:

1. Keep the structure identical — same number of `#`/`##` headings, tables and code blocks.
2. Copy code blocks **verbatim**. They are real command output, not prose.
3. Leave commands, flags, paths and package names untranslated.
4. Update the language switcher line only for the language you are editing.

A quick structural check:

```bash
node -e "const f=require('fs');const c=t=>{const l=t.split('\n');let n=0;for(const x of l){if(/^## /.test(x))n++}return n};for(const p of ['README.md','README.ja.md','README.ko.md','README.es.md','README.fr.md','README.de.md','README.pt-BR.md','README.zh.md'])console.log(p,c(f.readFileSync(p,'utf8')))"
```

## Commits and pull requests

- Small, focused commits with an imperative subject line: `Fix upstream subpath on Windows 8.3 short paths`.
- Explain *why* in the body when the diff alone doesn't make it obvious.
- Run `npm test` before pushing. CI runs the matrix on Linux, macOS and Windows for Node 22 and 24.
- Fill in the PR template; link the issue it closes.

## Releasing

Maintainers only:

1. Bump `version` in `package.json` **and** `packages/dsh-skill-healthcheck/package.json`, and add a `CHANGELOG.md` section.
2. Merge to `main` and wait for CI to be green.
3. Push a `v<version>` tag. `.github/workflows/release.yml` verifies the tag matches both `package.json` files, runs the tests, and publishes both packages with provenance. It needs the `NPM_TOKEN` repository secret.
4. Create the GitHub Release from the same tag.

## Security

Please don't open a public issue for a vulnerability — see [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Be decent to each other.
