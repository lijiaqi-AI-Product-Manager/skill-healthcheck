## What this changes

<!-- One paragraph. What problem does it solve, and why this way? -->

## Type

- [ ] Bug fix
- [ ] New check or finding
- [ ] Output / i18n change
- [ ] Documentation
- [ ] Refactor with no behavior change

## How it was tested

<!-- Which tests were added or updated? If the change touches git or session logs, say how you reproduced it. -->

## Checklist

- [ ] `npm ci && npm run build && npm test` passes locally
- [ ] New behavior has a test that fails without the change
- [ ] User-facing text exists in both Chinese and English (`src/i18n.ts`)
- [ ] `--json` shape and finding codes stay stable (see `docs/findings.md`)
- [ ] `README.md` updated, and `README.zh.md` if user-facing behavior changed
- [ ] No secrets, tokens, or private paths in the diff or the tests

## Related issues

<!-- Closes #123 -->
