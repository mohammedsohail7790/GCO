# GCO — Client Discovery Package

**Purpose.** An internal checklist to run against a real client's API documentation the moment it arrives, so mapping their real behavior onto GCO's existing `IntegrationAdapter` contract (`lib/integrations/adapter.ts`) is systematic, not ad hoc. This package names no client — populate it only once real documentation is actually in hand or in this repository.

**Governing skill:** `gco-integration` (`.claude/skills/gco-integration/SKILL.md`) — its client-spec gate applies to every item below: an unchecked item is a blocker to writing adapter code against *real* shapes, not an assumption to fill in.

**Commit under discovery:** `6ffc8d5`.

---

## A. API documentation checklist
- **Need:** Full API reference (REST/GraphQL/webhook-first/other), sandbox and production base URLs.
- **Why GCO needs it:** `IntegrationAdapter.normalizeInbound()`/`sendOutbound()` must be written against a real request/response shape — nothing today can be assumed beyond `dev-mock`'s own invented contract (`lib/integrations/adapters/devMock.ts`).
- **Depends on it:** Whether a new adapter file can be started at all (`lib/integrations/adapters/<client-key>.ts`).

## B. Authentication checklist
- **Need:** Auth method for calls GCO makes *to* the client (API key/OAuth2/mTLS/other), credential delivery and rotation process.
- **Why GCO needs it:** `sendOutbound(req, config)`'s `config` parameter is currently unused by `dev-mock` — a real adapter must implement a concrete scheme.
- **Depends on it:** What goes into the `Integration.config` JSON field and `Integration.secretRef` (schema already supports non-secret config + a secret reference, confirmed in `prisma/schema.prisma`) for this client.

## C. Webhook checklist
- **Need:** Exact signing algorithm, signature header name, secret provisioning/rotation process, retry policy on their side if GCO's ack fails or times out.
- **Why GCO needs it:** The only signature verification that exists today is `dev-mock`'s HMAC-SHA256 timing-safe compare against `DEV_WEBHOOK_SECRET` — a real client's scheme must map exactly onto `verifyWebhookSignature(rawBody, headers, secret)` or the entry-point integrity guarantee is lost.
- **Depends on it:** The new adapter's `verifyWebhookSignature` implementation; whether `secretRef` needs per-integration secret storage beyond a single shared dev secret.

## D. Inbound payload checklist
- **Need:** Real (not schema-only) inbound payload examples — normal message, empty text, system messages if any, multiple events per delivery if applicable.
- **Why GCO needs it:** `normalizeInbound(payload): NormalizedInboundMessage[]` must return an array (it can be one payload → multiple messages, as the interface already allows) and must throw on malformed input in a way the webhook route's `handleRouteError` classifies correctly.
- **Depends on it:** The field-mapping logic inside the new adapter's `normalizeInbound`.

## E. Outbound API checklist
- **Need:** The exact API call to send a reply, required fields, sync-accept vs. async-confirm response shape.
- **Why GCO needs it:** `workers/processors/outboundDelivery.ts` calls `adapter.sendOutbound({ externalUserId, content, externalMessageId }, integration.config)` and expects back `{ delivered, externalDeliveryId?, error? }`. A non-`delivered` result throws, which triggers BullMQ's existing 5-attempt exponential backoff (`lib/queue/queues.ts::defaultJobOptions`) — confirmed by code this session.
- **Depends on it:** Whether `sendOutbound`'s existing three-field request shape is sufficient, or the client needs something the interface doesn't currently carry (flagged in Phase 3 gap analysis, not assumed here).

## F. Conversation/thread identity checklist
- **Need:** Whether the platform has a stable conversation/thread ID; how a new conversation is distinguished from a continuing one for the same user.
- **Why GCO needs it:** `lib/messages/ingest.ts::ingestOneMessage` reuses "the most recent non-`CLOSED`/non-`FAILED` conversation for this `externalUserId`" — a real, code-confirmed rule, not a schema assumption. If the client's continuation semantics differ, conversations could be wrongly merged or fragmented.
- **Depends on it:** Whether `NormalizedInboundMessage` needs an explicit conversation/thread field added (a potential interface change — flag for approval, do not add speculatively).

## G. User identity checklist
- **Need:** Stability of the external user ID over time (does it change on re-auth, account merge, etc.)?
- **Why GCO needs it:** `externalUserId` is the sole key `ingestOneMessage` uses to look up the "same user's" conversation (`Conversation.externalUserId`, indexed `[tenantId, externalUserId]`). An unstable ID silently fragments conversation history.
- **Depends on it:** Whether the adapter needs an ID-normalization/mapping step before calling into `normalizeInbound`'s contract.

## H. Delivery-status checklist
- **Need:** How GCO learns a sent reply was actually delivered — synchronous response, async webhook, or polling; the full status taxonomy (sent/delivered/read/failed/other).
- **Why GCO needs it:** `Message.status` already models `RECEIVED`/`PENDING_REVIEW`/`SENT`/`DELIVERED`/`FAILED` (confirmed in `prisma/schema.prisma`), and `outboundDeliveryProcessor` currently expects a *synchronous* return from `sendOutbound`. An async delivery-confirmation model (a callback/webhook after the fact) is not currently represented anywhere in the interface.
- **Depends on it:** Whether a second, delivery-confirmation webhook route/handler is required (a new capability, not implicit in the current interface — flag for approval).

## I. Media/attachment checklist
- **Need:** Whether messages can include images/files/other media, and in what format (URL, base64, upload endpoint); whether the client can *receive* media in replies.
- **Why GCO needs it:** `Message.content` is a plain `@db.Text` field; `NormalizedInboundMessage`/`OutboundSendRequest` carry only `content: string`. There is zero media support anywhere in the schema or interface today (confirmed by code read this session).
- **Depends on it:** If required, this is a **schema change** (a new field/table) and an **interface change** — both cross the core-pipeline boundary and require explicit approval per `gco-engineering`'s rules, not adapter-only work.

## J. Rate-limit checklist
- **Need:** Limits the client imposes on calls GCO makes to them; the client's expected inbound volume to GCO.
- **Why GCO needs it:** GCO's own inbound webhook limit is fixed at 3000/min per integration (`lib/api/rateLimit.ts::RATE_LIMITS.WEBHOOK`), keyed per-integration already — sizing this against the client's real volume, and pacing GCO's own outbound calls against their limit, both need real numbers.
- **Depends on it:** Whether the adapter needs its own outbound-call throttling beyond what exists today (none exists at the adapter level currently).

## K. Error/retry checklist
- **Need:** Error code taxonomy; whether the client retries failed webhook deliveries to GCO, and with what backoff/attempt count.
- **Why GCO needs it:** GCO's webhook route already deduplicates via `WebhookEvent(integrationId, externalEventId)` uniqueness and safely re-enqueues a persisted-but-unprocessed event (confirmed in `app/api/v1/webhooks/[integrationId]/route.ts`) — but this depends on the client supplying a stable `externalEventId` (or GCO's payload-hash fallback being adequate for their payload shape).
- **Depends on it:** Whether the adapter needs to map the client's specific error codes onto retry-vs-permanent-failure classification for outbound sends.

## L. Sandbox checklist
- **Need:** Sandbox base URL and credentials; confirmation the sandbox behaves identically to production (same auth, same payload shapes).
- **Why GCO needs it:** No adapter beyond `dev-mock` can be contract-tested without one — this is the literal precondition for Phase 6's sandbox test tier.
- **Depends on it:** The entire "sandbox validation sequence" in the implementation plan (Phase 5) cannot start without this.

## M. Production credential/onboarding checklist
- **Need:** Process and secure channel for exchanging production credentials once sandbox validation passes; any approval/review step on the client's side.
- **Why GCO needs it:** Determines the last step before a real pilot can run against real production traffic rather than sandbox traffic.
- **Depends on it:** The "production credential validation sequence" in Phase 5.

## N. Security/compliance checklist
- **Need:** Any specific security/compliance requirement (data handling, encryption, access controls) the client imposes beyond GCO's own baseline.
- **Why GCO needs it:** GCO has made no compliance certification claims (no SOC2/ISO/GDPR-as-processor claim exists) — a client requirement here could be a hard gate on the engagement, independent of adapter code.
- **Depends on it:** Whether this becomes a business/legal gate rather than an engineering one — flag, don't engineer around it silently.

## O. Data retention/privacy checklist
- **Need:** Any requirement on how long conversation data may be retained; applicable regulatory framework (region/industry-specific).
- **Why GCO needs it:** GCO currently has no retention/purge mechanism of its own — `Message`/`Conversation` rows persist indefinitely by default.
- **Depends on it:** Whether a retention/purge job becomes required scope (new engineering, not adapter-only) — flag for approval, do not build speculatively.

## P. Pilot volume checklist
- **Need:** Approximate expected message volume (peak and average) for a controlled pilot window.
- **Why GCO needs it:** `Tenant.messageCap` is a **soft, non-atomic ceiling** (`lib/tenant/activity.ts::isMessageCapReached` — a `usageRecord.count()` read, not a transactional reservation, confirmed this session) — it must be set with real headroom above the client's actual expected peak, or a concurrent burst near the cap can overshoot it.
- **Depends on it:** The exact `messageCap` value configured on the pilot `Tenant` row.

---

## How this package is used

1. When real documentation/sandbox access arrives, work through A→P in order, marking each item answered/unanswered with the actual source (a doc URL, a quoted spec section, a sandbox test result).
2. Any item still unanswered when adapter work is proposed is a blocker per `gco-integration`'s gate — do not proceed past it with an assumption.
3. Feed the answers directly into Phase 5 of the integration implementation plan (`docs/GCO_FINAL_V1_READINESS_AUDIT.md`-style evidence discipline: every decision cites the actual answer, not an inferred one).
