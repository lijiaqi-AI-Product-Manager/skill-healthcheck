import { execFile } from 'node:child_process'

export interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
  LC_ALL: 'C',
}

/** Run git without ever prompting; never throws. */
export function git(args: string[], options: { cwd?: string; input?: string; timeoutMs?: number } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      ['-c', 'credential.interactive=never', '-c', 'core.quotepath=off', ...args],
      { cwd: options.cwd, env: GIT_ENV, timeout: options.timeoutMs ?? 30_000, maxBuffer: 64 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
      (error, stdout, stderr) => {
        const code: unknown = error ? (error as { code?: unknown }).code : 0
        resolve({ ok: !error, stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code: typeof code === 'number' ? code : 1 })
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
  })
}
