import 'dotenv/config'
import { defineConfig } from '@playwright/test'

// API-level E2E suite: exercises the real running app/API (no mocking), using
// Playwright's request context. No browser binaries required or launched -
// these tests hit real HTTP endpoints against a real Postgres/Redis-backed
// instance (see docs/testing.md for how to start one).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false, // tests share a running server + DB; keep deterministic
  workers: 1, // single BullMQ worker process backs all of this - avoid cross-file queue contention
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  },
})
