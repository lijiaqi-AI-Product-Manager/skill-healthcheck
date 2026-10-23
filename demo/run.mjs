// 15-second demo. Everything happens in demo/.sandbox with a fake HOME: nothing touches
// your real ~/.dsh. Upstreams are local bare git repos, so it works offline.
// The dsh session logs are synthetic (same record format dsh writes), standing in for
// two weeks of real usage.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

const here = dirname(fileURLToPath(import.meta.url))
const cli = join(here, '..', 'dist', 'cli.js')
const box = join(here, '.sandbox')
const fast = process.argv.includes('--fast')
rmSync(box, { recursive: true, force: true })

const home = join(box, 'home')
const { NO_COLOR: _noColor, ...inherited } = process.env
const env = {
  ...inherited,
  SKILL_HEALTHCHECK_USER_HOME: home,
  DSH_HOME: join(home, '.dsh'),
  DSH_AGENTS_HOME: join(home, '.agents'),
  SKILL_HEALTHCHECK_HOME: join(home, '.skill-healthcheck'),
  DSH_BUNDLED_SKILL_DIR: join(box, 'no-bundled'),
  FORCE_COLOR: '1',
  GIT_AUTHOR_NAME: 'demo',
  GIT_AUTHOR_EMAIL: 'demo@example.com',
  GIT_COMMITTER_NAME: 'demo',
  GIT_COMMITTER_EMAIL: 'demo@example.com',
}
const project = join(box, 'project')
const DAY = 86_400_000
const now = Date.now()

const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, stdio: 'pipe' })
const skill = (name, description, body) => `---\nname: ${name}\ndescription: ${description}\n---\n${body}\n`

function upstream(name, files) {
  const bare = join(box, 'upstream', `${name}.git`)
  const work = join(box, 'upstream', `${name}-work`)
  mkdirSync(work, { recursive: true })
  git(box, 'init', '--bare', '-q', '-b', 'main', bare)
  git(work, 'init', '-q', '-b', 'main')
  git(work, 'config', 'core.autocrlf', 'false')
  git(work, 'remote', 'add', 'origin', bare)
  const commit = (changes, message) => {
    for (const [p, text] of Object.entries(changes)) write(join(work, p), text)
    git(work, 'add', '-A')
    git(work, 'commit', '-q', '-m', message)
    git(work, 'push', '-q', 'origin', 'main')
  }
  commit(files, 'init')
  return { bare, commit }
}

// --- a dsh install with two skills cloned from GitHub-like upstreams ---
write(join(env.DSH_HOME, 'profiles', 'desktop', 'package.json'), JSON.stringify({ name: 'dsh-profile-desktop', private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
write(join(env.DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json'), JSON.stringify({ desktopVersion: '0.2.1-rc.2' }))
mkdirSync(join(project, '.git'), { recursive: true })

const zh = upstream('zh-writer', { 'SKILL.md': skill('zh-writer', 'Chinese writing assistant for articles, polished paragraphs and rewritten copy', '# Chinese writing\n\nKeep the user\'s voice and reply in Simplified Chinese.') })
const docs = upstream('doc-writer', {
  'SKILL.md': skill('doc-writer', 'Turn requirements into documents. Always respond in English using professional tone.', '# Doc writer\n\nUse English terminology for all headings.'),
})
for (const [name, repo] of [['zh-writer', zh], ['doc-writer', docs]]) {
  git(box, 'clone', '-q', '-c', 'core.autocrlf=false', repo.bare, join(env.DSH_HOME, 'skills', name))
}

// --- two weeks of session logs: doc-writer's update (pulled 4 days ago) shows up in the catalog ---
const sessionsDir = join(env.DSH_HOME, 'sessions', '--demo-workspace--')
const zhReply = '好的，我把需求整理成了文档，分为背景、目标、验收标准三部分，你看看哪里需要调整。'
const enReply = 'Sure. I organized the requirements into a document with background, goals and acceptance criteria. Let me know what to adjust.'
for (let d = 14; d >= 0; d--) {
  const t = now - d * DAY - 3600_000
  const updated = d <= 4
  const catalog = [
    { name: 'zh-writer', description: 'Chinese writing assistant for articles, polished paragraphs and rewritten copy' },
    { name: 'doc-writer', description: updated ? 'Turn requirements into documents. Always respond in English using professional tone.' : 'Turn requirements into a clearly structured document' },
  ]
  const lines = [
    { type: 'session', version: 4, id: `session-demo-${d}`, createdAt: t, cwd: project },
    { type: 'user/message', time: t + 1, data: { content: [{ type: 'text', text: '<system-reminder>...' }], source: { kind: 'skill-catalog', form: 'catalog', entries: catalog } } },
    { type: 'user/message', time: t + 2, data: { content: [{ type: 'text', text: '帮我把这次的需求整理成一份文档，写清楚背景和目标。' }], source: { kind: 'user' } } },
    { type: 'tool/call', time: t + 3, data: { name: 'skill', arguments: JSON.stringify({ name: 'doc-writer' }) } },
    { type: 'assistant/message', time: t + 4, data: { message: { role: 'assistant', content: [{ type: 'text', text: updated ? enReply : zhReply }] } } },
  ]
  write(join(sessionsDir, `session-demo-${d}`, 'session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join('\n'))))
}

// --- the show ---
const pause = (ms) => fast || Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const lang = process.argv.includes('--lang') && process.argv[process.argv.indexOf('--lang') + 1] === 'zh' ? 'zh' : 'en'
const narration = {
  en: [
    'First checkup: two skills installed, all green, the journal starts recording',
    "A few days later the zh-writer author rewrites its description (you haven't pulled yet)",
    'Separately: the agent stopped answering in Chinese. Why?',
    'stopped replying in Chinese',
  ],
  zh: ['第一次体检：装了两个技能，一切正常，记录器开始记录', '几天后，zh-writer 的上游作者改了 description（你还没有 pull）', '另一件事：agent 最近不用中文回答了，为什么？', '为什么它现在不用中文回答我了'],
}[lang]
const say = (text) => console.log(`\n\x1b[2m# ${text}\x1b[0m`)
const run = (...args) => {
  console.log(`\x1b[1m$ skill-healthcheck ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\x1b[0m`)
  spawnSync(process.execPath, [cli, '--lang', lang, ...args], { cwd: project, env, stdio: 'inherit' })
}

say(narration[0])
run()
pause(1500)
say(narration[1])
zh.commit({ 'SKILL.md': skill('zh-writer', 'Writing assistant for blog posts and marketing copy. Keep a professional tone.', '# Writing\n\nKeep the user\'s voice.') }, 'generalize description')
pause(800)
run()
pause(2000)
say(narration[2])
run('why', narration[3])
