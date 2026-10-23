import { describe, expect, it } from 'vitest'
import { setLang, tr } from '../src/i18n.js'

const CJK = /[\u4e00-\u9fff]/

describe('output translation', () => {
  it('keeps Chinese untouched by default', () => {
    setLang(undefined)
    expect(tr('宿主  dsh')).toBe('宿主  dsh')
  })

  it('translates the check header lines', () => {
    setLang('en')
    expect(tr('宿主  dsh 0.2.1 ✓')).toBe('Host    dsh 0.2.1 ✓')
    expect(tr('插件  0：0 正常 · 0 可升级 · 0 失效')).toBe('Plugins  0: 0 ok · 0 upgradable · 0 broken')
    expect(tr('技能  2：1 正常 · \x1b[36m1\x1b[0m 有更新 · 0 失效')).toBe('Skills  2: 1 ok · 1 update · 0 broken')
  })

  it('translates the summary line', () => {
    setLang('en')
    expect(tr('结论：都还在正常工作，没有需要你处理的')).toBe('Summary: everything still works, nothing for you to do')
    expect(tr('结论：插件 2 个可一键升级；技能 3 个需你逐个确认')).toBe(
      'Summary: 2 plugins can be upgraded in one go; 3 skills need you to review them',
    )
  })

  it('translates impact findings', () => {
    setLang('en')
    expect(tr('上游改了 description：删去 "a" "b"，新增 "c"')).toBe('Upstream changed the description: removed "a" "b", added "c"')
  })

  it('translates why output', () => {
    setLang('en')
    expect(tr('这是按时间和关键词排的嫌疑顺序，不是定论；可以先停用第 1 名验证。')).toBe(
      'Ranked by time and keywords, not a verdict. Disable #1 first to confirm.',
    )
  })

  it('leaves no Chinese in a rendered check sample', () => {
    setLang('en')
    const sample = [
      '宿主  dsh 0.2.1-rc.2 ✓',
      '插件  0：0 正常 · 0 可升级 · 0 失效  另有组合包 1 个',
      '技能  2：1 正常 · 1 有更新 · 0 失效',
      '      ↑ zh-writer        Upstream changed the description: removed "a", added "b"  ⚠最高危',
      '结论：技能 1 个需你逐个确认',
      '已开始记录（2 条）。以后每次运行都会记下变化。',
    ].join('\n')
    expect(CJK.test(tr(sample))).toBe(false)
  })
})
