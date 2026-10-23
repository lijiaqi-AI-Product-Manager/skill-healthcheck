# Finding codes

Every finding in `skill-healthcheck --json` has a stable `code`, a `severity` (`critical`, `high`, `medium`, `low`, `info`), an `area`, a `subject`, a localized `message` and optional `detail` lines. Build tooling on `code` and `severity`; `message` and `detail` follow `--lang`.

`subject` is the skill or plugin name, except for `nested` (a path relative to its root) and `unscanned-root` (an absolute path).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Nothing is broken. Available upstream updates count as good: the tool cannot know whether a new description still triggers for you. |
| `1` | A skill is `broken` (a local or usage finding at `critical`, or an orphan finding at `critical`/`high`), or a plugin is broken. |
| `2` | Usage error: unknown command, bad `--lang`/`--platform`, unparseable `--since`, or a Node version below `engines`. |
| `3` | The tool itself failed (unexpected exception). CI can tell this apart from a real finding. |

`severity` and the exit code are deliberately different things. `description-changed` can be `critical` (a trigger word disappeared) while `check` still exits `0`: that is an *upstream* risk, not a local failure. Gate on `severity` if you want updates to fail your build.

## `--json` shape

```json
{
  "schemaVersion": 1,
  "platform": { "id": "dsh", "profile": "desktop", "host": { "name": "dsh", "version": "0.2.1", "ok": true } },
  "plugins": { "plugins": [], "bundles": [], "checkedRegistry": true },
  "skills": [{ "name": "pdf", "state": "ok", "file": "…", "source": "user-dsh", "provenance": {}, "upstream": { "state": "current", "commit": "…" }, "findings": [] }],
  "other": [],
  "pluginFindings": [],
  "recorded": 0
}
```

- `schemaVersion` changes only when this shape breaks; fields are only ever added within a major value.
- `other` holds findings about things that are not an active skill (`dropped`, `shadowed`, `nested`, `unscanned-root`).
- `pluginFindings` carries the plugin codes below; `plugins` carries the per-plugin inventory.
- `journalError` appears only when the data directory could not be written; the check still ran.
- `skills[].upstream` is present only when provenance is a git URL; `state` is one of `current`, `changed`, `removed-in-repo`, `repo-missing`, `repo-moved`, `unreachable`.
- `provenance.url` has any `user:token@` part redacted.

## Stability

Finding codes are append-only: a code is never renamed or removed within 1.x, and a new one ships in a minor release. Severity may be tightened when calibration data shows it was wrong (noted in CHANGELOG). `message` and `detail` are localized prose: do not match on them.

## Local (area `local`, offline)

| Code | Severity | Meaning |
|---|---|---|
| `dropped` | critical (info for a flat `.md` without frontmatter) | The platform silently ignores the file: bad YAML, missing name/description, non-kebab-case name, invalid invocation booleans or legacy keys |
| `shadowed` | high (info when identical) | Another skill with the same name wins (dsh), or two copies conflict within one agent (Claude Code, Codex) |
| `nested` | high | `SKILL.md` files deeper than `<root>/<name>/SKILL.md`; never discovered |
| `unscanned-root` | high | Skills in a directory the platform doesn't read (e.g. `~/.claude/skills` for dsh) |
| `description-truncated` | medium | The description is longer than the catalog limit (dsh: 500); the end is cut off. Only reported where the limit is known, so not in `--platform generic` |
| `model-invocation-disabled` | info | `disable-model-invocation: true`: only usable as `/name` |

## Usage evidence (area `usage`, from session logs)

| Code | Severity | Meaning |
|---|---|---|
| `went-quiet` | critical when a description change the model saw can explain the silence, else high | Called at least twice, then not called in 3+ later sessions while still listed in the catalog. `critical` requires the old description to have still been listed around the last call and the new one to appear within two weeks: a description edited long after the skill went unused is not the cause |

## Upstream (area `upstream`)

| Code | Severity | Meaning |
|---|---|---|
| `upstream-invalid` | critical | The new upstream version would be dropped (see `dropped`) |
| `name-changed` | critical | Renamed upstream; `/old-name` stops working |
| `model-invocation-disabled` | critical | Upstream added `disable-model-invocation` |
| `user-invocation-disabled` | critical | Upstream added `user-invocable: false` |
| `description-changed` | critical when words were removed, high when only language/tone rules were added, else medium | The trigger text changed; `detail` has before/after and the words |
| `description-truncated` | high | The new description crosses the catalog limit (only checked where the limit is known) |
| `description-grew` | low | The description grew a lot (costs catalog context every turn); checked on every platform |
| `scripts-added` | high | New files under `scripts/`: review before use |
| `scripts-changed` | medium | Existing scripts changed |
| `body-grew` | low | The body grew by more than 2,000 characters (tokens per invocation) |
| `platform-specific` | medium | New syntax that doesn't run on the current OS |
| `moved-in-repo` | medium | The skill moved to another folder in its repository |
| `upstream-minor` | low | Changed, but nothing that affects triggering |
| `removed-upstream` | critical | Deleted from its repository. Renames are followed first (git rename detection, then content similarity), so a renamed-and-rewritten skill reports `name-changed` instead |
| `repo-missing` | critical | The repository is gone (an explicit not-found; network errors never count). A `metadata.source` that points to a missing local path is reported as `unreachable` instead: a third-party typo must not fail your CI |
| `repo-moved` | medium | The repository moved (GitHub redirect) |
| `upstream-unreachable` | info | Couldn't check (offline, network, auth, or a refused source address) |

## Plugins (area `plugin`, dsh only)

| Code | Severity | Meaning |
|---|---|---|
| `plugin-broken` | critical | Missing from `node_modules`, incompatible with this dsh, or deprecated |
| `plugin-exempted` | medium | Incompatible but running on a version exemption |

These appear in the top-level `pluginFindings` array.

## `--explain`

With `--explain`, a skill verdict may carry `explanation`: one sentence from the configured LLM. The top-level `explain` field says which provider and model wrote it, or `{ "used": false }` when none was configured. Explanations never change a verdict, a severity or the exit code.
