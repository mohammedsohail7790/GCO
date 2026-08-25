# Testing

Four layers, each with a different job. All four have actually been run - see `docs/production-readiness-audit.md` and the final CTO report for when/what.

## 1. Unit tests (`npm test`)

`tests/unit/*.test.ts`, run via Vitest, no external dependencies (no DB/Redis). Cover pure logic where a subtle bug would be easy to miss and expensive in production:

- `assignmentPolicy.test.ts` - operator selection, capacity, SLA deadline math (8 tests)
- `rbac.test.ts` - the permission matrix (5 tests)
- `tenantGuard.test.ts` - tenant-scope resolution per role, including the ASSISTANT/MANAGER global-vs-tenant-scoped distinction (8 tests)
- `realtimeTickets.test.ts` - realtime WS tickets and REST access tokens are mutually rejected by each other's verifier (4 tests)

25/25 passing as of this writing.

## 2. Integration tests (`npm run test:integration`)

`tests/integration/*.test.ts`, run via Vitest against a **real** Postgres/Redis (must be running - see `docs/deployment.md`). Cover cross-module correctness that a unit test can't:

- `webhookDedup.test.ts` - duplicate webhook processing produces exactly one message and one usage record
- `rateLimit.test.ts` - the Redis-backed limiter's window/independence/TTL behavior

4/4 passing.

## 3. E2E tests (`npm run test:e2e`)

`tests/e2e/*.spec.ts`, run via Playwright's API request context - **no browser is launched**; these are real HTTP calls against a running app instance (`http://localhost:3000` by default, override with `E2E_BASE_URL`), asserting against real database state. Requires the web app, worker, Postgres, and Redis all running (see Quick Start in the README).

| File | Covers |
|---|---|
| `01-message-lifecycle.spec.ts` | Full normal flow: webhook -> message -> conversation -> assignment -> AI suggestion -> operator edit -> send -> delivery -> usage, asserting DB state at every step |
| `02-webhook-integrity.spec.ts` | Forged signature rejected + nothing persisted; exact duplicate delivery produces exactly one message/usage record |
| `03-operator-capacity.spec.ts` | A third conversation stays queued once the sole operator hits capacity=2 |
| `04-sla-timeout.spec.ts` | Repeated SLA expiry -> requeue -> reassign, with a full audit trail and no duplicate active assignments |
| `05-tenant-isolation.spec.ts` | Cross-tenant access attempts via query params, path params, and guessed IDs, across CLIENT/MANAGER/OPERATOR roles |
| `06-rbac.spec.ts` | Each role's actual API-level access boundaries, including ASSISTANT's global-operational-role behavior |
| `07-session-security.spec.ts` | Missing/invalid/forged tokens, logout invalidation, login error-message parity, privilege escalation via request body |
| `08-ai-memory.spec.ts` | Explicit-fact extraction with full traceability; vague text extracts nothing (no hallucination) |
| `09-dead-letter-recovery.spec.ts` | A real job driven to permanent failure, landing in dead-letter, requeued by an admin, audited, and denied to a CLIENT |
| `10-usage-ledger-business-model.spec.ts` | The usage ledger validated against the exact stated business model (€0.14/€0.06/€0.08/€0.004 per message), permission-gated margin visibility, duplicate-safety |

32/32 passing. Each spec file seeds its own isolated tenant(s) (`tests/e2e/helpers.ts::seedIsolatedTenant`) so tests never collide with the demo data or each other, and cleans up after itself.

**Known constraint**: the suite runs with `workers: 1` (fully serial) because all tests share one running worker process and one database - parallelizing would introduce queue-contention flakiness rather than genuine isolation. This makes the suite slower (~30s) than a "properly" parallel one, which is the right tradeoff at this size.

## 4. Load testing (`npm run loadtest`)

Not a correctness suite - see `docs/load-testing.md` for method, results, and caveats.

## Running everything before you trust a change

```bash
npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build
# with the app + worker + postgres + redis running:
npm run test:e2e
```

## What's NOT covered yet

- Browser-driven UI tests (the four dashboards are manually verified - see `docs/mvp.md` - but have no automated click-through coverage).
- The real OpenAI provider (only the mock provider is exercised by any automated test - see `docs/ai.md`).
- Sustained-duration/soak testing (see `docs/load-testing.md`).
