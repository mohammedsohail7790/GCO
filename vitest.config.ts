import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    // Tests that exercise the MOCK AI path opt in explicitly; the guard tests (aiMasterSwitch) clear it to prove the default is OFF.
    env: { AI_MASTER_SWITCH: 'enabled', AI_PROVIDER: 'mock' },
    // Several integration files hash passwords with bcrypt cost 12 while others run in parallel against one database; the default
    // 5 s timed out intermittently under that load (a different test each run, always passing alone). A real hang still fails.
    testTimeout: 30_000,
    // Integration files share one real database and some assert on global row counts (e.g. 'no user was created'); running files
    // one at a time keeps those assertions deterministic. Tests inside a file still run in their declared order.
    fileParallelism: false,
  },
})
