# 03 — Staging validation

**Important:** "staging" below means the repository's staging configuration run as a **second local stack** (separate database `gco_staging`, Redis index 5, ports 3200/3201, `GCO_ENVIRONMENT=staging`, AI pinned off) built from the same commit. **No staging environment exists on a server, and nothing was run under Docker.** Do not read any PASS below as "the staging server is operational".

Date: 2026-10-20 · Stack started from the current working tree (includes this work's changes).

| # | Check (from the brief) | Result | Evidence |
|---|---|---|---|
| 1 | Clean deployment | **PASS (local)** — `next build` succeeded and the staging web, worker and realtime processes started | build log; `/api/v1/health` returned healthy |
| 2 | Environment configuration validation | **PASS (local)** — health reports `environment: "staging"`; `robots.txt` returns `Disallow: /`; AI mode `disabled` | commands run this session |
| 3 | Database migration and schema compatibility | **PASS (local)** — `prisma migrate deploy` applied all 29 migrations to the clean `gco_staging` database | command output |
| 4 | Authentication and RBAC | **PASS (local)** — simulator is owner-only (manager/operator 403, anonymous 401); a different client's supervisor cannot read another client's conversations | `tests/e2e/37-staging.spec.ts` (E2E_STAGING=1) |
| 5 | Core CRM workflows | **PASS on the local production-like stack**, not on the staging stack — the CRM E2E specs create their own CEO session from the demo seed, which staging deliberately does not contain | full E2E run (`10-ceo-readiness-report.md`) |
| 6 | Queue assignment and SLA behaviour | **PASS (local)** — message to Aurora assigned to an English operator; Swedish message waits (no covering operator); Pixel Arena assigned | E2E `37` |
| 7 | Webhook signature validation and delivery | **PASS (local)** through the simulator (dev-mock adapter); real provider: **BLOCKED** | E2E `37`, `02`, `18`, `25` |
| 8 | Retry and dead-letter behaviour | **PASS on the production-like local stack** | E2E `09` |
| 9 | Tenant isolation | **PASS (local)** — replies never leak to another client; separate teams/secrets | E2E `37`; `stagingSeed` integration test |
| 10 | Health and readiness checks | **PASS (local)** — `{healthy:true, database up, redis up, environment staging, ai disabled}` | curl |
| 11 | Logging and error handling | **PASS (local, limited)** — health no longer echoes driver errors; request-path logs contain no message content (code search) | `02` §5 |
| 12 | Rollback / redeployment | **NOT TESTED** — procedure documented in `03-staging-setup.md`; local stack was stopped and restarted only |

Not applicable here: external credentials are absent, so external integrations are test doubles and **unverified**. AI could not be exercised in staging (disabled by design); the disabled state is verified by `tests/e2e/52-ai-disabled.spec.ts` on a production-like stack (2 passed) and by staging health.

**Staging is NOT claimed operational.** Remaining blockers: Docker run, server deployment, access gate, DNS — `03-staging-setup.md` §3.
