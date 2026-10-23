import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Assertions are written against the Chinese messages; English is covered in i18n.test.ts.
    setupFiles: ['test/setup.ts'],
    env: { SKILL_HEALTHCHECK_LANG: 'zh' },
  },
})
