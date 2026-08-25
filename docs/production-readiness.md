# GCO Production Readiness Report

Last updated: 2026-08-26. This is the authoritative current-state summary. For the detailed findings/fixes log that produced it, see `docs/production-readiness-audit.md`. Every claim below is labeled with exactly one of:

- **VERIFIED** — actually run/tested this session, with evidence.
- **IMPLEMENTED BUT NOT VERIFIED** — code exists, has not been executed against the real thing.
- **BLOCKED** — cannot proceed without external input (client specs, credentials, infrastructure).
- **NOT YET BUILT** — doesn't exist.

## 1. Architecture

**VERIFIED.** Modular monolith + workers (deliberately not microservices — see `docs/decisions.md`): Next.js 16 app (frontend + `/api/v1/*`), a separate BullMQ worker process, a separate realtime WebSocket process, PostgreSQL (sole source of truth), Redis (queue + rate limiting + pub/sub, disposable). Full diagram in `docs/architecture.md`.

## 2. Core message lifecycle

**VERIFIED** end-to-end, repeatedly, via `tests/e2e/01-message-lifecycle.spec.ts`: webhook → HMAC verify → persist → dedup → durable queue → normalize → persist message → race-safe assignment → AI suggestion → operator review/edit → send → outbound delivery → usage ledger → audit trail.

## 3. Queue

**VERIFIED.** BullMQ/Redis, 6 queues + dead-letter. Idempotent enqueue (deterministic job IDs), retry with backoff, dead-letter capture on exhausted retries. A real job was driven to permanent failure, landed in dead-letter, and was recovered by an admin with a full audit trail (`tests/e2e/09-dead-letter-recovery.spec.ts`). Worker-crash recovery is **VERIFIED architecturally** (BullMQ only acks a job after the processor returns) but **NOT VERIFIED** via an actual fault-injection test (no worker was killed mid-job in this session).

## 4. Assignment

**VERIFIED.** Transactional conditional-update prevents double-assignment; capacity enforcement tested with a 3rd conversation correctly staying queued once the sole operator hit capacity=2 (`tests/e2e/03-operator-capacity.spec.ts`).

## 5. SLA

**VERIFIED.** Server-side deadline (`Assignment.respondsBy`, computed at assignment time, not browser-dependent). Repeated expire → requeue → reassign cycles tested with a full `AssignmentHistoryEntry` audit trail and an explicit invariant check that no two assignments are simultaneously ACTIVE for one conversation (`tests/e2e/04-sla-timeout.spec.ts`).

## 6. AI

**VERIFIED** (mock provider): structured output, human-only send enforcement, accepted/edited tracking, non-blocking failure handling, memory extraction with full traceability and no hallucination on vague input (`tests/e2e/08-ai-memory.spec.ts`).

**IMPLEMENTED BUT NOT VERIFIED**: the OpenAI provider (`lib/ai/providers/openai.ts` — timeout, structured-output validation, error handling all coded). `OPENAI_API_KEY` is empty in this environment (confirmed via `grep` this session); the provider has never called the real OpenAI API. The mock provider remains the only one exercised by any test.

## 7. Realtime

**VERIFIED.** A real architectural gap was found first — the original design required an httpOnly cookie's value as a WS query param, which client JS can never read, making it unusable from any browser — and fixed with a short-lived (30s) ticket mechanism, distinct from REST access tokens and mutually rejected by each other's verifier. This session specifically verified:

- Missing/garbage/expired tickets and REST-access-tokens-used-as-tickets all rejected with WS close code 4001 (`tests/e2e/11-realtime-security.spec.ts`)
- A valid ticket connects successfully
- **Cross-tenant isolation**: two isolated tenants, two live sockets, a tenant-B-only webhook fired — tenant A's socket received zero messages, tenant B's received both expected events
- End-to-end in a real browser: a webhook-triggered event updated the operator dashboard's conversation list in under a second, ahead of the 5s polling fallback
- Polling remains unconditionally active regardless of WebSocket state — the database is the sole source of truth; duplicate/missed WS events are harmless by construction since every event only triggers a refetch, never carries trusted data itself

**NOT YET BUILT**: single-use ticket enforcement (a ticket is reusable within its 30s window — assessed as low risk since reuse only lets the *same already-authenticated identity* open another socket as itself, not a privilege escalation; not implemented to avoid unnecessary complexity, per explicit instruction not to over-engineer).

## 8. Security

**VERIFIED.** This session found and fixed 10 real vulnerabilities (full detail in `docs/production-readiness-audit.md` §2), each with a regression test:

1. Operator-send authorization bypass (any operator could message any conversation once unassigned) — critical
2. Cross-tenant AI suggestion IDOR — critical
3. MANAGER accounts silently unusable due to a tenant-scope bug — critical
4. CLIENT could see full operator identity via `/conversations` — medium
5. Logout didn't actually revoke sessions (cookie path mismatch) — critical
6. Missing `output: 'standalone'` would break every Docker build — high
7. Missing `.dockerignore` risked baking `.env` into an image — high
8. Realtime server was architecturally unusable from any browser — high
9. Hardcoded Postgres password in a committed `docker-compose.yml` — medium
10. 5xx errors leaked raw internal exception messages; validation errors and malformed JSON were misclassified as 500 instead of 400 (found together, both fixed) — medium

**What was attempted and failed to break the system**: tenant manipulation via every parameter surface (query, path, guessed IDs), role escalation via request body, forged JWT signatures, session reuse after logout, webhook forgery/replay, unauthorized admin/recovery/operator/client-endpoint access, cross-tenant WebSocket leakage.

**NOT YET BUILT**: per-integration-configurable rate limits (global constants today); a formal third-party security audit.

## 9. Multi-tenancy

**VERIFIED.** Server-enforced in `lib/auth/tenantGuard.ts::resolveTenantScope` — a supplied `tenantId` never widens a CLIENT/MANAGER/OPERATOR session's actual scope; ASSISTANT/CEO_ADMIN are the only global-operational roles. Attacked via query params, path params, and guessed conversation/ticket IDs across every role — all blocked (`tests/e2e/05-tenant-isolation.spec.ts`). WebSocket channel isolation separately verified (§7).

## 10. RBAC

**VERIFIED** at the API level (not just the permission-matrix unit tests) — every role's actual access boundaries tested directly against running endpoints, including the ASSISTANT-is-global-not-tenant-scoped distinction (`tests/e2e/06-rbac.spec.ts`).

## 11. Usage / business model

**VERIFIED** against the exact stated numbers: €0.14 client price, €0.06 operator cost, €0.08 gross margin, 5% founder share (= €0.004/message). `tests/e2e/10-usage-ledger-business-model.spec.ts` confirms: N processed messages produce exactly N usage records with correct totals at every level; duplicate webhook delivery does not inflate any figure; a MANAGER (no `VIEW_REVENUE` permission) sees message counts but never margin/founder-share figures; every usage record traces back to a real message and tenant. No payout mechanism exists or was built — by design, this phase is measurement/auditability only.

## 12. Recovery

**VERIFIED**: dead-letter capture and admin-recovery-with-audit-trail (§3). **Documented, not drilled**: PostgreSQL backup/restore procedure (`docs/deployment.md`) — a restore has never actually been performed against this system. **Architecturally sound but not fault-injected**: worker-crash recovery. **NOT YET BUILT**: pause/resume queue from the UI, disable-integration UI control (both noted as known gaps in `docs/recovery.md`).

## 13. Observability

**VERIFIED**: structured JSON logging (`lib/observability/logger.ts`, replacing bare `console.log` in the worker/API/realtime processes), `/api/v1/health` and `/admin/system-health` both confirmed accurate against live state throughout this session's testing.

## 14. Tests

| Suite | Count | Result |
|---|---|---|
| Unit | 29 | **VERIFIED** — all pass |
| Integration | 4 | **VERIFIED** — all pass (real Postgres/Redis) |
| E2E | 38 | **VERIFIED** — all pass (real HTTP, real DB, real WebSocket) |
| typecheck / lint / build | — | **VERIFIED** — all clean |

**71 automated tests total.** Full breakdown in `docs/testing.md`.

## 15. Performance

**VERIFIED** at 100/500/1000 messages/minute (`docs/load-testing.md`): 100% persistence at every tier, webhook ack p99 ≤29ms. **Explicit caveat, unchanged**: single local machine, no network hop, mock AI provider — not a production-topology benchmark. **NOT YET VERIFIED**: sustained/soak duration, true concurrent burst, multi-operator-at-scale concurrency, real AI provider latency under load.

## 16. Docker

**IMPLEMENTED BUT NOT VERIFIED.** Docker is not installed in this environment (confirmed: no `docker` binary present, checked this session). Two real bugs that would have broken the build were found and fixed: missing `output: 'standalone'` (confirmed via `.next/standalone` not existing before the fix, existing after) and a missing `.dockerignore` (confirmed by observing the standalone build copy `.env` into its output before the fix). A hardcoded Postgres password in `docker-compose.yml` was also fixed. `npm run build && npm run start` — the non-containerized equivalent of what the image runs — is fully verified. **`docker build` / `docker compose up` have never been executed.**

## 17. Deployment

**IMPLEMENTED BUT NOT VERIFIED** for the containerized path (see §16); **VERIFIED** for the direct-process path (this entire session ran the app, worker, and realtime server as plain Node processes against real Postgres/Redis). CI pipeline (`.github/workflows/ci.yml`) exists and mirrors the exact regression commands verified manually this session, but the pipeline itself has never executed on GitHub's infrastructure (no push has been made — this repo currently only exists locally with two commits).

## 18. Real client integration

**BLOCKED.** Only the `dev-mock` adapter exists, clearly labeled development-only. `docs/client-integration-checklist.md` lists the exact 18 items required from a real client before any client-specific code can be written — none of it has been invented or assumed. The integration abstraction (`lib/integrations/adapter.ts`) is architected so a new adapter requires zero changes to the core message model, queue, assignment engine, operator workflow, AI layer, or usage ledger — confirmed by inspection: every core module calls only `adapter.normalizeInbound()` / `adapter.sendOutbound()`, never a raw client payload shape directly.

## 19. Remaining risks

1. Rate limits are global constants, not per-integration-configurable — a genuinely high-volume client needs an explicit override mechanism before this becomes their bottleneck.
2. No formal third-party security audit.
3. Backup/restore procedure documented but never drilled.
4. Worker-crash and Redis/DB-outage recovery are architecturally sound but not fault-injection tested.
5. CI pipeline has never actually run (repo not yet pushed to GitHub).

---

## Release gate

See the final CTO report for the formal classification. Summary: all internal engineering — core pipeline, security, multi-tenancy, RBAC, realtime, business model, 71 passing automated tests — is complete and verified. The three items blocking full production sign-off (real client specs, an OpenAI key, a Docker-capable environment) are all external dependencies, not remaining engineering work.
