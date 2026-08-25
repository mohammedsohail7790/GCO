# Production Readiness Audit

Date: 2026-08-25. This is a living document - re-run the checks in each section before trusting a stale copy of this file.

## Method

Full repository read (schema, every API route, every worker/processor, every lib module, all four dashboards), cross-checked against actual query patterns and against a running instance (Postgres + Redis + Next dev server + BullMQ worker, all local - see `docs/decisions.md`). Every finding below marked "confirmed" was reproduced against the live system, not inferred from reading code alone.

---

## 1. Already verified (re-confirmed this pass)

- Webhook HMAC verification, dedup, fast-ack - unchanged, still correct.
- Message idempotency (`(tenantId, externalMessageId, direction)` unique) - unchanged, still correct.
- Race-safe assignment (conditional update inside a transaction) - unchanged, still correct.
- Server-side SLA timer + auto-reassignment - unchanged, still correct.
- AI suggestion generation, structured output, human-only send - unchanged, still correct.
- Usage ledger idempotency - unchanged, still correct.
- AI memory extraction, async, non-blocking - unchanged, still correct.
- All four dashboards render against real data.
- `/api/v1/health` and `/admin/system-health` report accurate live state.

---

## 2. Critical risks found and fixed this pass

### 2.1 Operator send authorization bypass (CONFIRMED, FIXED)

**File**: `app/api/v1/messages/send/route.ts`

The route only checked assignment ownership `if (conversation.currentAssignmentId)` - truthy check. Once an assignment completed (or expired, or was reassigned away), `currentAssignmentId` becomes `null` and the entire ownership check was skipped, silently falling through to `operatorSendMessage`. Additionally, the route never compared `conversation.tenantId` to the operator's tenant at all.

**Impact**: any authenticated OPERATOR could send an unlimited number of messages into any conversation - including another tenant's - once that conversation had no active assignment (which is most conversations most of the time: closed, waiting-for-client, or belonging to a different operator).

**Reproduced**: sent message #1 through the legitimate flow (succeeded, 200, completed the assignment), then sent message #2 to the same now-unassigned conversation as the same operator - succeeded before the fix. After the fix, message #2 correctly returns 403.

**Fix**: require `conversation.tenantId === operator.tenantId` unconditionally, and require `currentAssignmentId` to be non-null and reference an `ACTIVE` assignment owned by the calling operator - no fallthrough case.

### 2.2 Cross-tenant AI suggestion leak / IDOR (CONFIRMED, FIXED)

**File**: `app/api/v1/conversations/[id]/suggestion/route.ts`

Tenant check only ran `if (session.role === 'CLIENT' ...)`. OPERATOR, MANAGER, and ASSISTANT sessions had zero tenant check - any authenticated staff account could read the AI-suggested reply text (private conversation content) for any conversation ID from any tenant, including ones they had no relationship to, by guessing/enumerating a `cuid`.

**Fix**: every role except `CEO_ADMIN` must now match `session.tenantId === conversation.tenantId`.

### 2.3 MANAGER/ASSISTANT tenant-scope inconsistency (CONFIRMED, FIXED)

**File**: `app/api/v1/admin/users/route.ts`, `lib/auth/tenantGuard.ts`, `app/api/v1/assignments/[id]/reassign/route.ts`, `app/api/v1/tickets/[id]/route.ts`

`admin/users` only assigned `tenantId` when creating `CLIENT` or `OPERATOR` users - a newly created `MANAGER` always got `tenantId: null`. But `resolveTenantScope` treated MANAGER as a tenant-scoped role requiring a matching `tenantId`, and several hand-rolled tenant checks (`reassign`, `tickets/:id`) only special-cased `CEO_ADMIN`. Net effect: **every MANAGER account created through the admin API was unusable** - every tenant-scoped endpoint would throw `ForbiddenError: No tenant context available`. Reproduced by creating a manager via the API and confirming `tenantId: null` in the response.

Separately, `ASSISTANT`'s permission set (`QUEUE_RECOVER`, `EMERGENCY_ACTIONS`, `CONVERSATION_REASSIGN`, `TICKET_MANAGE`, `VIEW_SYSTEM_METRICS`) is inherently cross-tenant operational recovery work, not "manage one client's data" - it should never have been tenant-pinned in the first place.

**Fix**: `MANAGER` now requires and receives a `tenantId` at creation (tenant-scoped, like OPERATOR/CLIENT). `ASSISTANT` is now treated as a global/operational role alongside `CEO_ADMIN` (no tenant of its own, may act across tenants for the specific permissions it holds) - `resolveTenantScope` and both hand-rolled tenant checks updated accordingly. Covered by new unit tests in `tests/unit/tenantGuard.test.ts`.

### 2.4 Missing `next.config.js` `output: 'standalone'` would break every Docker build (CONFIRMED, FIXED)

The `Dockerfile` (written earlier, never buildable in this environment - no Docker was available until now) copies `.next/standalone`, but `next.config.js` never set `output: 'standalone'`. Verified by running `npm run build` and checking: `.next/standalone` did not exist before the fix. Every `docker build` would have failed at that `COPY` step - this was undetected purely because nothing had tried to build the Docker image yet. Found while writing `.github/workflows/ci.yml` and actually running `npm run start` against a real build.

### 2.5 No `.dockerignore` - local `.env` could be baked into a Docker image (CONFIRMED, FIXED)

While verifying fix 2.4, observed that Next's standalone build output copies any `.env` file sitting next to `next.config.js` into `.next/standalone/.env` (this is intentional Next.js behavior, not a bug in Next). Combined with a missing `.dockerignore`, `docker build .` would send the developer's real `.env` (with real `AUTH_SECRET`, `OPENAI_API_KEY`, etc. once populated for a real deployment) into the build context, where `COPY . .` in the Dockerfile's builder stage would pick it up, and the standalone-copy behavior above would bake it directly into the final image layer - a real secret leak into anything that image gets pushed to. Fixed with a `.dockerignore` excluding `.env*`, `.git`, `node_modules`, `.next`, and other build artifacts, so `next build` running inside Docker never has a `.env` to copy in the first place (production secrets are correctly injected at container runtime via `docker-compose.yml`'s `env_file: .env`, which was already right).

### 2.6 CLIENT role could see full operator identity via `/conversations` (CONFIRMED, FIXED)

**File**: `app/api/v1/conversations/route.ts`

The list endpoint always `include`d `currentAssignment: { operator: true }` regardless of caller role - a CLIENT session (tenant-isolation was correct, but role scoping was not) could see the assigned operator's internal record (`operatorNumber`, `status`, `capacity`, `userId`) for every conversation in their own tenant. The spec is explicit: "Client must never access... internal operator information outside their permitted scope."

**Fix**: the operator relation is now only expanded when the caller has `VIEW_OPERATOR_DETAIL` (`CEO_ADMIN`/`MANAGER`); other roles still see `currentAssignment` (status, SLA deadline) but not the joined operator record.

---

## 3. Medium risks (documented, not yet fixed - tracked for follow-up)

| Risk | Detail | Recommendation |
|---|---|---|
| ~~No rate limiting beyond login~~ ADDRESSED THIS PASS | Added a Redis-backed limiter (`lib/api/rateLimit.ts`, works across multiple instances unlike the old in-memory login one) on `/webhooks/:id` (per-integration) and `/messages/send` (per-user). Login migrated to the same mechanism. **Caught its own bug during load testing**: the initial webhook limit (300/min) was below the business's stated 1000/min peak tier and would have silently rejected legitimate traffic - see `docs/load-testing.md`. Fixed to 3000/min. | Still tracked: the limit is a global constant, not per-integration-configurable. A real client with sustained volume genuinely above 3000/min/integration needs an explicit override mechanism, not another blind global bump. |
| No webhook timestamp/replay window | Dedup by `externalEventId`/payload hash prevents *exact* replays from double-processing, but there's no timestamp-based rejection of old, captured-then-replayed requests outside a reasonable window. | Low priority while only the dev-mock adapter exists; revisit once a real client's webhook spec is known (many providers include a timestamp header for this). |
| ~~`pino` is an unused dependency~~ ADDRESSED THIS PASS | Wired up as `lib/observability/logger.ts`, now used by the worker process, the API's unhandled-error path, and the realtime server in place of bare `console.log`/`console.error`. Emits structured JSON in production, pretty-printed in dev. | None - the seed script and load-test script intentionally keep plain `console.log` since they're CLI tools, not server logs. |
| ~~Dead-letter recovery never exercised with a real permanent failure~~ ADDRESSED THIS PASS | `tests/e2e/09-dead-letter-recovery.spec.ts` now drives a real job to permanent failure via a controlled fast-fail job, confirms it lands in dead-letter, confirms an admin can see and requeue it, confirms the requeue is audited, and confirms a CLIENT session is rejected from the same action. | None. |

## 4. Low risks

- `AssignmentTimeout` queue's `respondsBy`-based delayed job is the only mechanism checking SLA; there's no DB index-driven "list all overdue assignments" admin query yet (the `@@index([respondsBy])` exists for this future use but nothing queries it today). Not a correctness issue, just an unused index kept for a documented future admin view.
- `npm audit` still flags moderate-severity issues in `vite`/`esbuild`, transitive dev-only dependencies of `vitest`. Not shipped to production; fixing requires a vitest major-version bump, deferred as low priority.
- No explicit state-machine guard module - valid transitions are enforced implicitly by which code paths call which mutations (documented in `docs/database.md`), not by a shared transition-validation function. Given the size of this system, an explicit state machine library would be premature abstraction (see `docs/decisions.md` "no over-engineering"); the existing implicit enforcement plus the fixes in Section 2 close the gaps that mattered.

## 5. Production blockers

1. **No real client integration.** Only the `dev-mock` adapter exists. See `docs/decisions.md` and the onboarding checklist at the bottom of this file - this is explicitly not something to fake.
2. **Real AI provider (OpenAI) has not been executed against a live API key** in this environment - only the mock provider has been run. See `docs/ai.md` for what's implemented vs. verified.
3. **Load testing was only run against a single-machine dev environment** (see `docs/load-testing.md`) - re-run against production-topology infrastructure before committing to a real client's expected volume.

Resolved this pass (were blockers, no longer are): rate limiting on webhook/mutating endpoints, structured logging, dead-letter recovery validation.

---

## 6. Real-client onboarding checklist

Required from the client before their integration can be built (do not proceed without these - inventing them would produce an adapter that silently fails against the real API):

1. Webhook documentation (endpoint shape, headers, retry behavior)
2. Authentication / signing method
3. Incoming payload examples (real, not schema-only)
4. Outbound message API (how GCO sends a reply)
5. Delivery status / callback mechanism
6. Conversation identifier semantics
7. User identifier semantics
8. Message identifier semantics
9. Timestamp semantics (timezone, format)
10. Rate limits
11. Retry rules (theirs, for our outbound calls)
12. Error codes and their meaning
13. Media/attachment requirements, if any
14. A test/sandbox environment
15. Production credentials (issued through a secure channel, never in chat/email)
16. Any security/compliance requirements specific to this client

Once supplied: implement `lib/integrations/adapters/<client-key>.ts` against `lib/integrations/adapter.ts`'s existing `IntegrationAdapter` interface (no core pipeline changes needed - that's the point of the abstraction), register it in `lib/integrations/registry.ts`, and write adapter-specific integration tests before connecting it to a real `Integration` row.
