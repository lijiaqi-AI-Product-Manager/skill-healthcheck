// The dsh plugin body, written against the core library passed in, so it can be tested
// without a dsh runtime. index.js wires it to the published skill-healthcheck package.
//
// What it does inside dsh:
//   - records a snapshot when the host starts, so the journal has no gaps while dsh runs;
//   - records again (debounced) whenever dsh reports that the skill catalog changed;
//   - registers /skill-healthcheck for the chat: `check` (default), `why <symptom>`, `log`, `ls`.
// It never modifies skills and never upgrades anything.

const DEBOUNCE_MS = 2000
const USAGE = 'Usage: /skill-healthcheck [why <symptom> | log | ls]'

/**
 * @param {typeof import('skill-healthcheck')} core
 */
export function createPlugin(core) {
  const name = 'skill-healthcheck'
  /** No required services: recording works in every profile, the command only where commands exist. */
  const inject = []

  /**
   * @param {any} ctx cordis context
   * @param {{ offline?: boolean, lang?: 'zh' | 'en' }} [config]
   */
  function apply(ctx, config = {}) {
    core.setColor(false)
    core.setLang(config.lang)
    const logger = typeof ctx.logger === 'function' ? ctx.logger(name) : ctx.logger
    let lastCwd = process.cwd()

    const recordNow = (cwd = lastCwd) => {
      try {
        core.scanAndRecord({ platform: 'dsh', cwd })
      } catch (error) {
        logger?.warn?.(`skill-healthcheck: recording failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Boot snapshot, off the startup path.
    const bootTimer = setTimeout(() => recordNow(), 0)
    let changeTimer
    ctx.on('skills/change', () => {
      clearTimeout(changeTimer)
      changeTimer = setTimeout(() => recordNow(), DEBOUNCE_MS)
    })
    ctx.effect(function* () {
      yield () => {
        clearTimeout(bootTimer)
        clearTimeout(changeTimer)
      }
    }, 'skill-healthcheck timers')

    ctx.inject(['commands'], (sub) => {
      sub.effect(function* () {
        yield sub.commands.register({
          definitionId: 'dsh-skill-healthcheck',
          name: 'skill-healthcheck',
          description: core.t('plugin.command'),
          input: { hint: 'why <symptom> | log | ls' },
          handler: (invocation) => handle(ctx, invocation, config, (cwd) => (lastCwd = cwd)),
        })
      }, 'skill-healthcheck command')
    })
  }

  async function handle(ctx, invocation, config, remember) {
    const cwd = await workingDirectory(ctx, invocation)
    remember(cwd)
    const input = String(invocation.rawInput ?? '').trim()
    const [sub = 'check', ...rest] = input.split(/\s+/).filter(Boolean)
    const options = { platform: 'dsh', cwd, offline: config.offline === true, explain: config.explain === true }
    try {
      switch (sub) {
        case 'check': {
          const result = await core.runCheck(options)
          return ok(core.renderCheck(result))
        }
        case 'why': {
          const symptom = rest.join(' ')
          if (!symptom) return { kind: 'error', text: USAGE }
          const { store, platform, inventory } = core.scanAndRecord(options)
          const sessions = core.loadSessions(platform.sessionSources, store)
          const result = core.why({ symptom, inventory, journal: store.readJournal(), store, sessions, timeline: core.catalogTimeline(sessions) })
          if (options.explain && !options.offline) await core.explainWhy(result, symptom, true, store)
          return ok(core.renderWhy(result, symptom))
        }
        case 'log': {
          const { store } = core.scanAndRecord(options)
          return ok(core.renderJournal(store.readJournal().filter((e) => e.kind !== 'baseline').slice(-30)))
        }
        case 'ls': {
          const { inventory } = core.scanAndRecord(options)
          return ok(core.renderInventory(inventory))
        }
        default:
          return { kind: 'error', text: USAGE }
      }
    } catch (error) {
      if (invocation.signal?.aborted) return { kind: 'error', text: 'Cancelled.' }
      return { kind: 'error', text: `skill-healthcheck failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  return { name, inject, apply }
}

/** The session's working directory when dsh exposes it, else the host's. */
async function workingDirectory(ctx, invocation) {
  const service = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
  if (service && invocation.agent) {
    try {
      return await service.ensure(invocation.agent, invocation.signal)
    } catch {
      // fall through
    }
  }
  return process.cwd()
}

/** Monospace block: the report is column-aligned. */
function ok(text) {
  return { kind: 'success', text: '```text\n' + text + '\n```' }
}
