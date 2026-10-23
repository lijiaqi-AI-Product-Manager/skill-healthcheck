import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Assertions are written against the Chinese messages; English is covered in i18n.test.ts.
    setupFiles: ['test/setup.ts'],
    env: { SKILL_HEALTHCHECK_LANG: 'zh' },
    // Upstream tests drive real git against local bare repos; Windows CI runners need far
    // more than the 5 s default (2-3 s locally).
    testTimeout: 30_000,
  },
})
