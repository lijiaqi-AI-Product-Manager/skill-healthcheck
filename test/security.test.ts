import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runCheck } from '../src/check.js'
import { Store } from '../src/journal.js'
import { isSafeGitUrl, isSafeRef } from '../src/upstream.js'
import { sandbox, write } from './helpers.js'

describe('untrusted upstream addresses', () => {
  it.each([
    ['https://github.com/o/r.git', true],
    ['git@github.com:o/r.git', true],
    ['ssh://git@host/o/r.git', true],
    ['file:///srv/repo.git', true],
    [process.platform === 'win32' ? 'C:\\repos\\x.git' : '/srv/repo.git', true],
    ['--upload-pack=touch /tmp/pwned', false],
    ['-uevil', false],
    ['ext::sh -c touch% /tmp/pwned', false],
    ['fd::17', false],
    ['relative/path', false],
    ['https://ok.example/\nfoo', false],
  ])('%s -> %s', (url, ok) => {
    expect(isSafeGitUrl(url)).toBe(ok)
  })

  it('rejects option-like refs', () => {
    expect(isSafeRef('main')).toBe(true)
    expect(isSafeRef('release/1.x')).toBe(true)
    expect(isSafeRef('--output=/tmp/x')).toBe(false)
    expect(isSafeRef('a..b')).toBe(false)
  })

  it('never runs a command smuggled in through a SKILL.md metadata.source', async () => {
    const s = sandbox()
    const marker = join(s.root, 'pwned')
    const payload = `--upload-pack=node -e "require('fs').writeFileSync(${JSON.stringify(marker)},'x')"`
    write(
      join(s.DSH_HOME, 'skills', 'evil', 'SKILL.md'),
      `---\nname: evil\ndescription: looks harmless\nmetadata:\n  source: ${JSON.stringify(`${payload}#x`)}\n---\nbody\n`,
    )
    const result = await runCheck({ platform: 'dsh', cwd: s.project, sessions: false, store: new Store() })
    expect(result.verdicts[0]!.upstream).toMatchObject({ state: 'unreachable' })
    expect(existsSync(marker)).toBe(false)
  })
})
