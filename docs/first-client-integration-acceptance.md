# First Client Integration Acceptance Test Plan

Run this end-to-end, against a real (client-specific) integration once implemented, before a pilot is declared ready. Provider-neutral - it does not assert anything about a specific provider's payload shape, only about GCO's own behavior. Use temporary/sandbox test data throughout; see `docs/real-client-data-gate.md` for when real customer data is actually allowed in.

Each test lists the mechanism GCO already has to satisfy it, so this checklist can be executed against the real system rather than treated as aspirational.

| # | Test | GCO mechanism |
|---|---|---|
| 1 | Tenant can authenticate | Standard login flow (`/api/v1/auth/login`), unchanged by any integration work |
| 2 | Correct integration belongs to correct tenant | `GET /api/v1/admin/integrations?tenantId=<id>` - confirm the integration's `tenantId` matches |
| 3 | Valid inbound webhook accepted | `POST /api/v1/webhooks/:integrationId` with a correctly signed payload → `202` |
| 4 | Invalid webhook rejected | Same endpoint, wrong/missing signature → `401`, fails closed (`app/api/v1/webhooks/[integrationId]/route.ts`) |
| 5 | Duplicate webhook does not create duplicate event/message | `WebhookEvent` unique on `(integrationId, externalEventId)`; `Message` unique on `(tenantId, externalMessageId, direction)` - confirm row counts stay at 1 after a repeated delivery |
| 6 | Conversation created correctly | `lib/messages/ingest.ts::ingestOneMessage` - confirm a new `Conversation` exists for the external user, correct `tenantId` |
| 7 | Correct contact/user mapping | Confirm `Conversation.externalUserId` matches the provider's contact identifier, and a second message from the same contact reuses the same conversation (not a duplicate) |
| 8 | Correct operator assignment | `lib/assignment/engine.ts::tryAssignConversation` - confirm the conversation reaches an `AVAILABLE` operator with capacity |
| 9 | Realtime update reaches operator | Confirm a WebSocket client connected as that operator receives a `message.received` event (`lib/realtime/publish.ts`) |
| 10 | Operator outbound message reaches provider | `POST /api/v1/messages/send` → `workers/processors/outboundDelivery.ts` → adapter's `sendOutbound()` - confirm delivery confirmation |
| 11 | Provider delivery event is handled | Confirm `Message.status` transitions to `DELIVERED` and a `MessageEvent` of type `DELIVERY_CONFIRMED` is recorded |
| 12 | Provider failure is surfaced | Force an adapter failure - confirm `Message.status` becomes `FAILED`, a `DELIVERY_FAILED` `MessageEvent` is recorded, and the job throws for BullMQ retry |
| 13 | Temporary provider failure can retry safely | Confirm the outbound queue's retry/backoff (5 attempts, exponential, see `lib/queue/queues.ts`) eventually either succeeds or reaches dead-letter - never silently drops |
| 14 | Rate-limit response is handled safely | Confirm GCO's own webhook rate limiter (`RATE_LIMITS.WEBHOOK`) returns `429` rather than crashing under burst load; confirm the *provider's* rate-limit behavior once known from discovery |
| 15 | Cross-tenant access attempt fails | A session from Tenant B cannot read/use Tenant A's integration or conversations - see `docs/pilot-acceptance-checklist.md`'s Data section |
| 16 | Integration secret cannot be retrieved through normal reads | `GET /api/v1/admin/integrations` uses an explicit `SAFE_SELECT` that excludes `webhookSecret` at the database query level (verified live in Phase 11) |
| 17 | Audit log records required security-sensitive actions | Confirm `integration.create` and `integration.webhook_secret_rotated` audit entries exist for this tenant, with no secret value in `metadata` |
| 18 | Restart/recovery does not create duplicate processing | Restart the worker mid-processing (or force a crash) - confirm `WebhookEvent.processed` idempotency (`lib/messages/ingest.ts::processWebhookEvent`) prevents double-processing on retry |
| 19 | Client data does not appear in another tenant | Query conversations/messages/leads for a different tenant - confirm none of this client's data appears |
| 20 | Rollback/disable procedure is understood | Confirm the team knows how to set `Integration.status = DISABLED` (currently: set at creation time, or via a direct, reviewed database update until a dedicated PATCH route exists - see `docs/client-tenant-provisioning.md` step 6) to stop the integration accepting new traffic without deleting anything |

## What this plan deliberately does not include

No provider-specific assertions (exact payload field names, specific error codes, specific rate-limit numbers) - those only exist once a real provider is chosen and `docs/first-client-integration-discovery.md` is filled in for it. Adding them before that would mean guessing provider behavior, which this phase's rules explicitly forbid.
