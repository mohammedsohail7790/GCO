---
name: gco-testing
description: Canonical procedure for running and honestly interpreting GCO's test suite (unit/integration/e2e/typecheck/lint/build) and for writing new tests in its existing idiom. Other GCO skills delegate verification to this skill rather than each maintaining their own command list.
---

# GCO Testing

## Purpose

Own the single canonical procedure for verifying GCO code — running the real test suite against the real local stack, no fakes — and for adding new tests in the same idiom when a change needs regression coverage. Every other GCO skill (`gco-engineering`, `gco-integration`, `gco-security-review`, `gco-production-readiness`) delegates its "run tests" step to this skill instead of restating commands, so the canonical list only has to be correct in one place.

## When to invoke automatically

- The user asks to run tests, check for regressions, or verify a change.
- As the verification step for `gco-engineering` or `gco-integration` after any code change.
- As the evidence-gathering step for `gco-security-review`'s "re-run the attacking test" requirement, or for `gco-production-readiness`'s fresh-evidence battery.
- Reconciling a documentation claim about test counts against what the repository actually contains/produces right now.

## When NOT to invoke

- To fabricate a pass/fail result without actually executing the command — never do this regardless of trigger.
- For security threat modeling itself — that judgment belongs to `gco-security-review`, which calls into this skill only to execute the relevant spec file(s).

## Canonical commands

These are GCO's actual `package.json` scripts. Use them exactly as written — do not invent alternate invocations:

```bash
npm run typecheck        # tsc --noEmit
npm run lint              # eslint .
npm test                  # vitest run tests/unit (no DB/Redis required)
npm run test:integration  # vitest run tests/integration (real Postgres/Redis required)
npx playwright test       # tests/e2e — real HTTP against a running app, real DB/Redis/WebSocket
npm run build             # next build
```

Additional useful, non-destructive checks in the same spirit:
```bash
npx prisma migrate status   # confirms migrations are applied cleanly
npx prisma validate         # confirms schema.prisma is valid
```

## Prerequisites

- `npm test` (unit) needs nothing beyond Node — no DB/Redis.
- `npm run test:integration` and `npx playwright test` require the **local development stack** to be up: PostgreSQL, Redis, the Next.js dev server, the BullMQ worker (`workers/index.ts`), and the realtime WebSocket server (`workers/realtime-server.ts`) — all on `localhost`, per `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md` §0. Confirm these are actually running before treating an integration/e2e failure as a code defect rather than an environment gap.
- The repository's own toolchain notes (`docs/decisions.md` — "Built and verified without Docker/Homebrew") describe a portable local stack under `.tools/` (Node tarball, Redis built from source, Postgres.app binaries) as one way this has been run without a system-level install or Docker.

## Current known test inventory (for orientation only — always re-count, never assume)

- `tests/unit/` — unit tests, no DB/Redis (files as of the last hardening pass: `tenantGuard`, `rbac`, `assignmentPolicy`, `realtimeTickets`, `errorClassification`).
- `tests/integration/` — real Postgres/Redis (files as of the last hardening pass: `rateLimit`, `tenantControls`, `webhookDedup`).
- `tests/e2e/` — real HTTP, no browser (12 numbered spec files as of the last hardening pass, `01-message-lifecycle.spec.ts` through `12-tenant-controls.spec.ts`).

These counts and file lists were accurate in `docs/GCO_V1_HARDENING_REPORT.md` and `docs/GCO_FINAL_V1_READINESS_AUDIT.md` as of commit `6ffc8d5`. **Do not report them as current fact** — always run `ls tests/unit tests/integration tests/e2e` and the actual suite before citing a number.

## The honest-reporting rule

`docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md` §0 sets the precedent this skill must follow: when a full-suite run shows intermittent failure (a test that fails once and passes on rerun), report it exactly as observed — "N of M runs were clean, the other runs each had one failure, here's which test and why" — never smoothed over into "should be fine" or silently rerun-until-green. If a test fails:
1. Report the exact failing test name and error.
2. Do not retry silently and report only the eventual pass.
3. Do not edit or delete the failing test to force a green suite without disclosing that action and its justification to the user.
4. Distinguish a genuine regression from an environment issue (e.g., stale Prisma client after a schema change requiring a dev-server/worker restart, or Redis rate-limit buckets tripped by a prior test run — both documented, non-defective causes in `docs/GCO_V1_HARDENING_REPORT.md` §5).

## Adding new tests

Match the existing idiom:
- Unit tests: pure logic, no DB/Redis, colocated under `tests/unit/`.
- Integration tests: real Postgres/Redis, no HTTP layer, under `tests/integration/`.
- E2E tests: real HTTP requests against the running app (no browser), under `tests/e2e/`, numbered to reflect suite order.

Do not introduce mocked/stubbed database or Redis behavior in integration or e2e tests — this is a deliberate, repository-wide convention ("no fakes").

## Output / report template

For any run, report:
- Exact command(s) executed.
- Exact pass/fail counts per suite.
- Any failure's test name, file, and error text.
- Whether prerequisites (Postgres/Redis/dev stack) were confirmed running.
- Explicit statement that this was executed in the current session, not recalled from a document.

## Must never do

- Report a test count or pass/fail result without having executed it in the current session.
- Claim GitHub Actions CI has run or passed — this skill only executes local commands; CI execution status is `gco-production-readiness`'s concern and requires evidence this skill cannot produce.
- Silently retry a failing test until it passes and report only the success.
- Modify a test's assertions to make a failing suite pass without explicit instruction and disclosure.
- Treat `.tools/`-based or otherwise non-Docker local execution as equivalent to a containerized/production-topology verification — it verifies the application code, not the deployment path.
