# Finding codes

Every finding in `skill-healthcheck --json` has a stable `code`, a `severity` (`critical`, `high`, `medium`, `low`, `info`), an `area`, a `subject` (skill or plugin name), a localized `message` and optional `detail` lines. Build tooling on `code` and `severity`; `message` follows `--lang`.

`check` exits with `1` when any skill is `broken`, any finding about something other than an active skill is `critical`/`high` (dropped, shadowed, nested, unscanned), or a plugin is broken. Updates alone exit `0`.

## Local (area `local`, offline)

| Code | Severity | Meaning |
|---|---|---|
| `dropped` | critical (info for a flat `.md` without frontmatter) | The platform silently ignores the file: bad YAML, missing name/description, non-kebab-case name, invalid invocation booleans or legacy keys |
| `shadowed` | high (info when identical) | Another skill with the same name wins (dsh), or two copies conflict within one agent (Claude Code, Codex) |
| `nested` | high | `SKILL.md` files deeper than `<root>/<name>/SKILL.md`; never discovered |
| `unscanned-root` | high | Skills in a directory the platform doesn't read (e.g. `~/.claude/skills` for dsh) |
| `description-truncated` | medium | The description is longer than the catalog limit (dsh: 500); the end is cut off |
| `model-invocation-disabled` | info | `disable-model-invocation: true`: only usable as `/name` |

## Usage evidence (area `usage`, from session logs)

| Code | Severity | Meaning |
|---|---|---|
| `went-quiet` | critical when it follows a description change the model saw, else high | The skill was called before and not since, while still in the catalog |

## Upstream (area `upstream`)

| Code | Severity | Meaning |
|---|---|---|
| `upstream-invalid` | critical | The new upstream version would be dropped (see `dropped`) |
| `name-changed` | critical | Renamed upstream; `/old-name` stops working |
| `model-invocation-disabled` | critical | Upstream added `disable-model-invocation` |
| `user-invocation-disabled` | critical | Upstream added `user-invocable: false` |
| `description-changed` | critical when words were removed, high when only language/tone rules were added, else medium | The trigger text changed; `detail` has before/after and the words |
| `description-truncated` | high | The new description crosses the catalog limit |
| `description-grew` | low | The description grew a lot (costs catalog context every turn) |
| `scripts-added` | high | New files under `scripts/`: review before use |
| `scripts-changed` | medium | Existing scripts changed |
| `body-grew` | low | The body grew by more than 2,000 characters (tokens per invocation) |
| `platform-specific` | medium | New syntax that doesn't run on the current OS |
| `moved-in-repo` | medium | The skill moved to another folder in its repository |
| `upstream-minor` | low | Changed, but nothing that affects triggering |
| `removed-upstream` | critical | Deleted from its repository |
| `repo-missing` | critical | The repository is gone (an explicit not-found; network errors never count) |
| `repo-moved` | medium | The repository moved (GitHub redirect) |
| `upstream-unreachable` | info | Couldn't check (offline, network, auth, or a refused source address) |

## Plugins (area `plugin`, dsh only)

| Code | Severity | Meaning |
|---|---|---|
| `plugin-broken` | critical | Missing from `node_modules`, incompatible with this dsh, or deprecated |
| `plugin-exempted` | medium | Incompatible but running on a version exemption |

## `--explain`

With `--explain`, a skill verdict may carry `explanation`: one sentence from the configured LLM. The top-level `explain` field says which provider and model wrote it, or `{ "used": false }` when none was configured. Explanations never change a verdict, a severity or the exit code.
