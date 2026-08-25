# GCO Production Readiness Report

Last updated: 2026-08-25. This is the authoritative current-state summary — for the detailed findings/fixes log that produced it, see `docs/production-readiness-audit.md`. Every claim below is labeled:

- **VERIFIED** — actually run/tested in this session, with evidence.
- **IMPLEMENTED BUT NOT VERIFIED** — code exists, has not been executed against the real thing.
- **BLOCKED** — cannot proceed without external input (client specs, credentials, infrastructure).
- **NOT YET BUILT** — doesn't exist.

## 1. Current architecture

Modular monolith + workers, not microservices (deliberate — see `docs/decisions.md`). Next.js 16 app (frontend + `/api/v1/*` route handlers), a separate BullMQ worker process, a separate realtime WebSocket process, PostgreSQL (source of truth), Redis (queue + rate limiting + pub/sub). Full diagram in `docs/architecture.md`.

```
Client webhook → HMAC verify → persist → dedup → durable queue
  → worker: normalize → persist message → race-safe assignment → AI suggestion (async)
  → operator reviews/edits → send → durable outbound queue → delivery
  → usage ledger (idempotent) → audit log
```

## 2. Verified capabilities

**VERIFIED** (61 automated tests: 25 unit + 4 integration + 32 E2E, all passing; see `docs/testing.md`):

- Webhook HMAC verification, dedup, idempotent message persistence
- Race-safe assignment, capacity enforcement, server-side SLA timer, auto-reassignment with full audit trail
- AI suggestion generation (mock provider), human-only send path, accepted/edited tracking
- AI memory extraction — traceable, non-hallucinating, non-blocking
- Usage ledger — idempotent, exactly matches the stated business model (€0.14/€0.06/€0.08/€0.004 per message)
- Tenant isolation across CLIENT/MANAGER/OPERATOR/ASSISTANT/CEO_ADMIN, via query params, path params, and guessed IDs
- RBAC boundaries at the API level (not just the permission-matrix unit tests)
- Session security — forged JWTs, garbage tokens, logout invalidation, login error parity, privilege-escalation attempts
- Dead-letter recovery — a real job driven to permanent failure, recovered, audited
- Redis-backed rate limiting on webhook and write endpoints
- Structured JSON logging
- Realtime push — a real webhook event observed arriving in a real browser tab's WebSocket in <1s
- `npm run typecheck` / `lint` / `build` all clean

## 3. Security status

**VERIFIED**: 8 real vulnerabilities found and fixed this phase (full detail in `docs/production-readiness-audit.md` §2), each with a regression test:

1. Operator-send authorization bypass (any operator could message any conversation once unassigned) — critical
2. Cross-tenant AI suggestion IDOR — critical
3. MANAGER accounts silently unusable due to a tenant-scope bug — critical
4. CLIENT could see full operator identity via `/conversations` — medium
5. Logout didn't actually revoke sessions (cookie path mismatch) — critical
6. Missing `output: 'standalone'` would break every Docker build — high
7. Missing `.dockerignore` risked baking `.env` into an image — high
8. Realtime server was architecturally unusable from any browser — high
9. Hardcoded Postgres password in a committed `docker-compose.yml` — medium

All fixed, all tested. **What was attempted and failed to break the system**: tenant manipulation via every parameter surface, role escalation via request body, forged JWT signatures, session reuse after logout, webhook forgery/replay, unauthorized admin/recovery access.

**NOT YET BUILT**: per-integration-configurable rate limits (currently global constants); a formal security audit by a third party.

## 4. Reliability status

**VERIFIED**: SLA timeout → requeue → reassignment cycle (repeated, no duplicate active assignments); dead-letter capture and recovery with audit trail; duplicate webhook/message/usage idempotency under direct test.

**IMPLEMENTED BUT NOT VERIFIED**: behavior under a real Postgres/Redis outage (temporary), a real worker crash mid-job, or sustained multi-hour load — architecturally designed for these (BullMQ redelivery, transactional writes) but not fault-injected in this session.

## 5. Performance results

**VERIFIED** at 100/500/1000 messages/minute (see `docs/load-testing.md` for full numbers): 100% persistence at every tier, webhook ack p99 ≤29ms, queue drains in single-digit milliseconds. **Explicit caveat**: single local machine, no network hop, mock AI provider — not a production-topology benchmark. A real rate-limit bug (too conservative) was caught and fixed by this testing.

**NOT YET VERIFIED**: sustained/soak duration, true concurrent burst (vs. this test's fixed-interval sends), multi-operator-at-scale concurrency, real AI provider latency under load.

## 6. AI status

**VERIFIED** (mock provider): structured output generation, human-only send enforcement, accepted/edited tracking, non-blocking failure handling, memory extraction with full traceability.

**IMPLEMENTED BUT NOT VERIFIED**: the OpenAI provider (`lib/ai/providers/openai.ts`) — timeout, structured-output validation, and error handling are all coded, but `OPENAI_API_KEY` is not set in this environment and the provider has never actually called the real OpenAI API. Do not represent this as tested until it has been run against a live key.

## 7. Docker status

**IMPLEMENTED BUT NOT VERIFIED**. Docker is not installed in this development environment (confirmed: no `docker` binary, no Docker.app). Two real bugs that would have broken the build were found and fixed by code review + indirect verification (`next.config.js` missing `output: 'standalone'`, confirmed via `.next/standalone` not existing before the fix and existing after; missing `.dockerignore`, confirmed by observing the standalone build copy `.env` into its output). `npm run build && npm run start` — the non-containerized equivalent of what the image runs — has been verified end-to-end. **`docker build` / `docker compose up` themselves have never been executed.** Run them before trusting the container image.

## 8. Realtime status

**VERIFIED**. Fixed a real architectural gap first (the WS auth design was unusable from any browser — see `docs/production-readiness-audit.md` §2.8), then wired it into the operator and manager dashboards with tenant-isolated auth via short-lived tickets, heartbeat-based stale-connection detection, and reconnect with backoff. Confirmed in a real browser: a webhook-triggered `message.received`/`assignment.created` event arrived over the socket and updated the operator's conversation list in under a second, well ahead of the 5s polling fallback. **Polling remains active unconditionally** — the database is the source of truth throughout, the WebSocket is purely a refetch trigger, so duplicate/missed events are harmless by construction.

## 9. Test results

| Suite | Count | Result |
|---|---|---|
| Unit | 25 | **VERIFIED** — all pass |
| Integration | 4 | **VERIFIED** — all pass (real Postgres/Redis) |
| E2E | 32 | **VERIFIED** — all pass (real HTTP, real DB) |
| typecheck / lint / build | — | **VERIFIED** — all clean |

Full breakdown in `docs/testing.md`.

## 10. Remaining blockers

1. **No real client integration** — **BLOCKED** pending client specification. See `docs/client-integration-checklist.md` for the exact 16-item list required.
2. **Real AI provider unverified** — **BLOCKED** pending an `OPENAI_API_KEY`.
3. **Docker build unverified** — needs a Docker-capable environment to actually run (code-level fixes are done; the commands themselves haven't executed).
4. **Production-topology load testing** — needs staging infrastructure matching real deployment (network hops, real AI latency).

## 11. Exact information required from the first client

See `docs/client-integration-checklist.md` in full. Summary: webhook URL/signature method, authentication for outbound calls, real payload examples (not schema-only), conversation/user/message ID semantics, timestamp format, outbound send API, delivery-status mechanism, error codes, rate limits, retry rules, media support, and both sandbox and production credentials delivered through a secure channel.

## 12. Exact next step after receiving client API specs

1. Implement `lib/integrations/adapters/<client-key>.ts` against the existing `IntegrationAdapter` interface — no core pipeline changes required, that's what the abstraction is for.
2. Register it in `lib/integrations/registry.ts`.
3. Write adapter-specific tests against their sandbox environment, modeled on `tests/e2e/01-message-lifecycle.spec.ts`.
4. Create the `Integration` row via the admin API, with the real webhook secret stored via `secretRef` (never the raw secret in the database).
5. Run the full regression suite (`docs/testing.md`) against the new adapter before that tenant goes live.
6. In parallel, close the three remaining blockers above (Docker build execution, real AI provider test, production-topology load test) — none of them depend on the client integration and can happen concurrently.
