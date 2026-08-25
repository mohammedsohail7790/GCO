# MVP Status

Tracking against the 22-point V1 definition. This file is a snapshot, not a guarantee - verify against actual code state and test runs before treating anything as "done."

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Client integration works | Adapter abstraction built; **dev-mock adapter only** - no real client API spec was available | `lib/integrations/` |
| 2 | Incoming messages reliably received | Webhook verify -> persist -> dedup -> enqueue | `app/api/v1/webhooks/[integrationId]/route.ts` |
| 3 | Messages persisted | `Message` + `MessageEvent` | `lib/messages/ingest.ts` |
| 4 | Durable queue | BullMQ/Redis, 6 queues | `lib/queue/` |
| 5 | Conversations assigned | Race-safe assignment engine | `lib/assignment/engine.ts` |
| 6 | Operator capacity enforced | `Operator.capacity`, default 2, configurable | `lib/assignment/policy.ts` |
| 7 | Server-side SLA timer | `Assignment.respondsBy`, delayed BullMQ job | `lib/queue/jobs.ts`, `lib/assignment/engine.ts` |
| 8 | Timeout causes reassignment | `expireAssignment` -> `tryAssignConversation` | `lib/assignment/engine.ts` |
| 9 | Operator sees conversation | Single-screen workspace | `app/operator/page.tsx` |
| 10 | AI generates suggestion | Provider abstraction, mock + OpenAI | `lib/ai/` |
| 11 | Operator can edit | Draft textarea, pre-filled from suggestion | `app/operator/page.tsx` |
| 12 | Operator manually sends | Only path that creates OUTBOUND messages | `lib/messages/send.ts` |
| 13 | Outbound reaches client | Durable delivery queue + adapter | `workers/processors/outboundDelivery.ts` |
| 14 | Conversation state updates | State machine on `Conversation.state` | `prisma/schema.prisma` |
| 15 | AI memory extraction async | Separate queue, best-effort | `workers/processors/memoryExtraction.ts` |
| 16 | Basic manager visibility | Operator roster + live counts | `app/manager/page.tsx` |
| 17 | Client sees own metrics | Usage summary + tickets | `app/client-panel/page.tsx` |
| 18 | CEO/Admin can manage system | Tenants, users, system health | `app/admin/page.tsx` |
| 19 | Usage/message counting | Idempotent ledger | `lib/usage/ledger.ts` |
| 20 | Audit logging | `writeAuditLog` on all sensitive actions | `lib/audit/log.ts` |
| 21 | Basic monitoring/recovery | Health endpoint, dead-letter requeue | `app/api/v1/admin/` |
| 22 | Multi-tenant isolation | Server-enforced tenant scoping | `lib/auth/tenantGuard.ts` |

## Verified (2026-08-25)

This build has actually been run, not just written. In a local environment (portable Node 20, a compiled-from-source Redis, and Postgres.app - see `docs/decisions.md` for why), the following were all executed and passed:

- `npm run typecheck`, `npm run lint`, `npm run build` - all clean.
- `npm test` - 18/18 unit tests pass (assignment policy, RBAC, tenant isolation).
- `npm run test:integration` - webhook idempotency test passes against real Postgres.
- **Full manual pipeline walkthrough**: webhook received (HMAC-verified) -> message persisted -> conversation auto-assigned to the available operator -> AI suggestion generated -> operator workspace UI showed it live -> operator edited and sent the reply through the browser -> outbound delivery worker marked it `DELIVERED` -> AI generation correctly recorded as `edited` -> assignment `COMPLETED` -> exactly one `UsageRecord` created.
- **SLA timeout + auto-reassignment**: set a tenant's SLA to 5s, sent a message, watched the assignment expire and cycle through reassignment automatically, all recorded in `AssignmentHistoryEntry`.
- **Security boundaries**: a forged webhook signature was rejected with 401; a CLIENT session attempting `?tenantId=<other>` was silently pinned back to its own tenant's data; a CLIENT hitting an admin-only route got 403.
- **All four dashboards** (login, operator workspace, manager, admin) rendered and worked correctly in a real browser against the real API.

Two real bugs were caught and fixed by this process (not visible from reading the code alone): BullMQ queue/job-id names cannot contain `:` (queue names and job IDs used `gco:queue-name` style separators - changed to `-`), and a webhook whose `WebhookEvent` row was persisted but whose queue enqueue then failed was being permanently treated as "already handled" by the dedup check - fixed to re-enqueue instead of silently dropping it (see `app/api/v1/webhooks/[integrationId]/route.ts`).

## Known gaps to close before a real client goes live

- **No real client integration** - only the dev-mock adapter exists. Building a real adapter requires that client's actual webhook/API spec (spec section 17/59 - intentionally not invented).
- **Realtime push is not yet wired into the UI** - the operator/manager pages currently poll (5-10s intervals) rather than consuming the WebSocket server that already exists (`workers/realtime-server.ts`) and was not exercised in the walkthrough above. Wiring a `useEffect` WebSocket client is the next increment.
- **No E2E test run** - `tests/e2e/` scaffold not yet written.
- **`npm audit`** still flags moderate-severity issues in `vite`/`esbuild` (vitest's transitive deps, dev-only) - not addressed since fixing them requires a vitest major-version bump; low priority since these don't ship to production.
