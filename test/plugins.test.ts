import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectPlatform } from '../src/platforms.js'
import { checkPlugins, isSafeNpmSpec, pluginFindings, type RegistryView } from '../src/plugins.js'
import { sandbox, write } from './helpers.js'

function profileWith(deps: Record<string, { pkg?: object }>, compatibility?: object) {
  const s = sandbox()
  const profile = join(s.DSH_HOME, 'profiles', 'desktop')
  write(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: Object.fromEntries(Object.keys(deps).map((n) => [n, '*'])), dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
  for (const [name, { pkg }] of Object.entries(deps)) {
    if (pkg) write(join(profile, 'node_modules', ...name.split('/'), 'package.json'), JSON.stringify({ name, ...pkg }))
  }
  if (compatibility) write(join(profile, 'compatibility.json'), JSON.stringify(compatibility))
  return detectPlatform({ cwd: s.project })
}

const fakeRegistry =
  (data: Record<string, object>): RegistryView =>
  async (spec) =>
    data[spec]

describe('checkPlugins (dsh profile)', () => {
  it('flags plugins pinned to another dsh version, and missing installs', async () => {
    const platform = profileWith({
      'dsh-old': { pkg: { version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh-base': '0.1.9' } } },
      'dsh-fine': { pkg: { version: '1.0.0', peerDependencies: { '@deepseek-ai/dsh-base': '0.2.1-rc.2' } } },
      'dsh-gone': {},
    })
    const report = (await checkPlugins(platform, { offline: true }))!
    const byName = Object.fromEntries(report.plugins.map((p) => [p.name, p]))
    expect(byName['dsh-old']).toMatchObject({ state: 'broken' })
    expect(byName['dsh-old']!.reason).toContain('0.1.9')
    expect(byName['dsh-fine']).toMatchObject({ state: 'ok' })
    expect(byName['dsh-gone']).toMatchObject({ state: 'broken' })
    expect(report.bundles).toEqual(['@deepseek-ai/dsh-base'])
  })

  it('reports a version exemption instead of a failure', async () => {
    const platform = profileWith({ 'dsh-old': { pkg: { version: '1.0.0', engines: { dsh: '<0.2.0' } } } }, { 'dsh-old@1.0.0': ['0.2.1-rc.2'] })
    const report = (await checkPlugins(platform, { offline: true }))!
    expect(report.plugins[0]).toMatchObject({ state: 'ok', exempted: true })
    expect(pluginFindings(report)).toMatchObject([{ code: 'plugin-exempted', severity: 'medium' }])
  })

  it('offers an upgrade only when the new version supports this dsh', async () => {
    const platform = profileWith({
      'dsh-a': { pkg: { version: '1.0.0' } },
      'dsh-b': { pkg: { version: '1.0.0' } },
    })
    const view = fakeRegistry({
      'dsh-a': { version: '1.2.0', 'dist-tags': { latest: '1.2.0' }, engines: { dsh: '>=0.2.0-0' } },
      'dsh-b': { version: '2.0.0', 'dist-tags': { latest: '2.0.0' }, peerDependencies: { '@deepseek-ai/dsh-base': '0.3.0' } },
    })
    const report = (await checkPlugins(platform, { view }))!
    const byName = Object.fromEntries(report.plugins.map((p) => [p.name, p]))
    expect(byName['dsh-a']).toMatchObject({ state: 'upgradable', latest: '1.2.0' })
    expect(byName['dsh-b']!.state).not.toBe('upgradable')
    expect(byName['dsh-b']!.reason).toContain('2.0.0')
  })

  it('treats a deprecated package as broken', async () => {
    const platform = profileWith({ 'dsh-a': { pkg: { version: '1.0.0' } } })
    const report = (await checkPlugins(platform, { view: fakeRegistry({ 'dsh-a': { version: '1.0.0', deprecated: 'use dsh-b' } }) }))!
    expect(report.plugins[0]).toMatchObject({ state: 'broken' })
  })
})

describe('isSafeNpmSpec', () => {
  it.each([
    ['dsh-foo', true],
    ['@scope/dsh-foo', true],
    ['@scope/dsh-foo@1.2.3', true],
    ['foo & calc', false],
    ['foo@latest; rm -rf ~', false],
    ['$(whoami)', false],
  ])('%s -> %s', (spec, ok) => {
    expect(isSafeNpmSpec(spec)).toBe(ok)
  })
})
