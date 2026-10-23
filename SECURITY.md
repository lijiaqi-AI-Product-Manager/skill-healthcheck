# Security policy

## Supported versions

| Version | Supported |
|---|---|
| 1.x | Yes |

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting:

<https://github.com/lijiaqimun-coder/skill-healthcheck/security/advisories/new>

Include the version (`skill-healthcheck --version`), your OS, and a minimal reproduction. If you can, say what an attacker gains — "arbitrary command execution via a malicious `metadata.source`" is far more useful than "it looks unsafe".

You can expect an initial reply within a few days. This is a small project maintained in spare time; please allow a reasonable window before disclosing publicly.

## What is in scope

`skill-healthcheck` reads untrusted content — `SKILL.md` files written by third parties, upstream git repositories, and session logs — so the following are treated as security issues:

- **Command or option injection through skill content**, especially `metadata.source` being turned into `git` arguments (`--upload-pack=…`, `ext::` transports, paths starting with `-`).
- **Credential leakage**: prompting for or forwarding git credentials, sending tokens or session logs to an LLM, writing secrets to the journal or cache.
- **Path traversal / arbitrary file write** through skill names, provenance subpaths, or the cache directory.
- **Data exfiltration** in `--explain` beyond the documented scope (it must send only the skill's before/after text and the detected words).
- **Denial of service via crafted input** that is cheap to trigger — for example a `SKILL.md` that hangs the parser or exhausts memory.

## What is not in scope

- Findings in third-party skills or repositories that the tool merely reports on. This tool tells you that an upstream changed; it does not vouch for what the upstream says.
- Vulnerabilities in dependencies that are already public and have no impact on the shipped package (dev-only tooling).
- Anything that requires the attacker to already have write access to your `~/.skill-healthcheck/` directory or your git configuration.

### Accepted boundaries

These are known and deliberate, not vulnerabilities:

- **`metadata.source` can name a host the tool will contact** (`https`, `ssh`, or a local path), so installing a hostile skill can make the tool attempt a `git fetch` to that host. Only public git data is read and fetched content is never executed; the failure message is shown to the user. There is no host allowlist because private mirrors are a normal setup. `metadata.source` cannot use `ext::` transports, option-like values, or a host that starts with `-`.
- **`file://` and absolute local paths are accepted** so a skill can point at a local mirror. The tool only runs `git` against them, in a private bare clone.
- **The journal, blob store and cache grow with use.** There is no automatic pruning; `rm -rf ~/.skill-healthcheck` is the documented reset. On multi-user hosts the data directory is created `0700` and its files `0600`.
- **Session logs are host-specific, undocumented formats.** A format change upstream can make parts of the backfill stop matching; the tool then reports fewer usage findings rather than inventing them.

## What the tool stores

| Path | Contents | Format |
|---|---|---|
| `journal.jsonl` | One line per observed change: skill name, source, path, sha256 of the file, description, body length, script hashes, timestamps | JSONL, `0600` |
| `blobs/<sha256>.md` | Full `SKILL.md` text, content-addressed, one file per version | UTF-8, `0600` |
| `snapshot.json`, `snapshots/*.json` | The last seen state per skill, split per project root | JSON, `0600` |
| `sources.json` | Sources registered with `adopt` (URL, subpath, ref) | JSON, `0600` |
| `sessions-cache.json` | Derived session facts only: catalog entries (name + description), skill calls with timestamps, per-day language counts. **No conversation text** | JSON, `0600` |
| `cache/<hash>.git` | Private blobless bare clones used for upstream comparison | git |
| `explain-cache.json` | LLM replies, keyed by a hash of provider, model and prompt | JSON, `0600` |

Nothing here is uploaded anywhere. `--explain` sends only the skill's before/after text and the word diff, never session data.

## How the tool is hardened

- Upstream URLs from `metadata.source` are validated: only `https`, `ssh`, `git` and `file` URLs and absolute paths are accepted; option-like values and `ext::` transports are refused; git runs with prompts disabled and behind `--end-of-options`.
- Package names passed to `npm view` are validated before use.
- Session logs are read locally and only derived data is cached; conversation text is never stored.
- `--explain` is opt-in, sends only skill text, fences it as untrusted, and truncates replies to one line.

See the "Data and privacy" section of the [README](README.md) for the details users are promised.
