import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export function tmp(prefix = 'shc-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

export function skillMd(fm: Record<string, unknown>, body = '# Skill\n\nDo the thing.\n'): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

export function write(file: string, content: string) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** Point every path the tool uses into a fresh sandbox. Returns the sandbox layout. */
export function sandbox(kind: 'dsh' | 'generic' = 'dsh') {
  const root = tmp()
  const home = join(root, 'home')
  const env = {
    SKILL_HEALTHCHECK_USER_HOME: home,
    DSH_HOME: join(home, '.dsh'),
    DSH_AGENTS_HOME: join(home, '.agents'),
    SKILL_HEALTHCHECK_HOME: join(home, '.skill-healthcheck'),
    CODEX_HOME: join(home, '.codex'),
    DSH_BUNDLED_SKILL_DIR: join(root, 'bundled'),
  }
  Object.assign(process.env, env)
  if (kind === 'dsh') {
    write(join(env.DSH_HOME, 'profiles', 'desktop', 'package.json'), JSON.stringify({ name: 'p', private: true, dependencies: {}, dsh: { profile: { bundles: [] } } }))
    write(join(env.DSH_HOME, 'dsh-runtimes', 'r', 'runtime.json'), JSON.stringify({ desktopVersion: '0.2.1-rc.2' }))
  }
  const project = join(root, 'project')
  mkdirSync(join(project, '.git'), { recursive: true })
  return { root, home, project, ...env }
}

export function gitRun(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  })
}

/** A bare "upstream" repo plus a work tree to commit into. */
export function upstreamRepo(root: string, files: Record<string, string>) {
  const bare = join(root, 'upstream.git')
  const work = join(root, 'upstream-work')
  mkdirSync(work, { recursive: true })
  gitRun(root, 'init', '--bare', '-q', '-b', 'main', bare)
  gitRun(work, 'init', '-q', '-b', 'main')
  gitRun(work, 'config', 'core.autocrlf', 'false')
  gitRun(work, 'remote', 'add', 'origin', bare)
  const commit = (changes: Record<string, string | null>, message: string) => {
    for (const [path, content] of Object.entries(changes)) {
      if (content === null) gitRun(work, 'rm', '-q', '-r', path)
      else write(join(work, path), content)
    }
    gitRun(work, 'add', '-A')
    gitRun(work, 'commit', '-q', '-m', message)
    gitRun(work, 'push', '-q', 'origin', 'main')
  }
  commit(files, 'init')
  return { bare, work, commit }
}
