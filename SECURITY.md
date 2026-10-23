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

## How the tool is hardened

- Upstream URLs from `metadata.source` are validated: only `https`, `ssh`, `git` and `file` URLs and absolute paths are accepted; option-like values and `ext::` transports are refused; git runs with prompts disabled and behind `--end-of-options`.
- Package names passed to `npm view` are validated before use.
- Session logs are read locally and only derived data is cached; conversation text is never stored.
- `--explain` is opt-in, sends only skill text, fences it as untrusted, and truncates replies to one line.

See the "Data and privacy" section of the [README](README.md) for the details users are promised.
