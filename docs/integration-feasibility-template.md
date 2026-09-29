# Integration Feasibility Assessment Template

Complete this template for **every** proposed client integration before it is promised to the client - in a proposal, a pilot scope, or a casual conversation. An integration is not "feasible" until this is filled in with real answers, not assumptions.

Copy this template per integration (e.g. `docs/feasibility/<client>-<channel>.md`).

## Basic information

| Field | Answer |
|---|---|
| Provider | |
| Channel/system | |
| Client account type | (e.g. Shopify Plus, WhatsApp Business API tier, custom in-house system) |

## Technical capability

| Field | Answer |
|---|---|
| API availability | |
| Authentication method | |
| Required permissions/scopes | |
| Webhook availability | |
| Inbound message format | |
| Outbound message format | |
| Rate limits | |
| Retry behavior (provider's own) | |
| Idempotency requirements | |
| Customer data access | |
| Order/data lookup capability | |
| Media support (images, files, etc.) | |
| Sandbox availability | |

## Process

| Field | Answer |
|---|---|
| Approval requirements (e.g. Meta Business verification) | |
| Estimated engineering complexity | See `docs/client-integration-estimation.md` categories |
| External dependencies | |
| Security/privacy considerations | |
| Pilot feasibility | Can this realistically be ready before the agreed pilot start date? |
| Known blockers | |

## Per-question feasibility (fill in every row)

Classify each as one of: **READY** / **REQUIRES CONFIGURATION** / **REQUIRES CLIENT INFORMATION** / **REQUIRES PROVIDER ACCESS** / **REQUIRES CODE** / **BLOCKED**. Never use vague language in the answer column - a blank or "probably" is not an assessment.

Every row classified **REQUIRES CODE** must additionally state: exact subsystem, likely file(s), the expected change, what test would cover it, and its deployment impact (does it need a migration? a rebuild? can it ship independently?).

| # | Question | Classification | Notes |
|---|---|---|---|
| A | Can the provider send inbound events to GCO? | | |
| B | Can GCO authenticate those events securely? | | e.g. `IntegrationAdapter.verifyWebhookSignature` - existing mechanism, provider-specific implementation needed if signature scheme differs from HMAC-SHA256 |
| C | Can GCO identify the correct tenant? | | Existing: `Integration.tenantId` via the URL path `/api/v1/webhooks/:integrationId` - this is already provider-neutral and works today |
| D | Can GCO create/update conversations? | | Existing: `lib/messages/ingest.ts::ingestOneMessage` - provider-neutral, already works |
| E | Can GCO create/update messages? | | Same as D |
| F | Can GCO assign conversations to operators? | | Existing: `lib/assignment/engine.ts` - provider-neutral, already works |
| G | Can GCO send outbound messages? | | Existing mechanism via `IntegrationAdapter.sendOutbound` - provider-specific implementation needed |
| H | Can GCO receive delivery/error events? | | Depends on whether the provider sends delivery-status webhooks - if so, needs a handler; if not, GCO only knows "sent," not "delivered" |
| I | Can GCO handle provider retries? | | Existing: `WebhookEvent` dedup on `(integrationId, externalEventId)` - provider-neutral, already works, **unless** the provider batches multiple events per delivery with no top-level event ID (see known gap in `docs/first-client-integration-discovery.md`) |
| J | Can GCO guarantee idempotency? | | Same mechanism as I, plus `Message` unique constraint on `(tenantId, externalMessageId, direction)` |
| K | Can GCO survive temporary provider/API failures? | | Existing: BullMQ retry/backoff + dead-letter queue - provider-neutral, already works |
| L | Are rate limits compatible with expected client volume? | | Needs the actual numbers from discovery, compared against GCO's own `RATE_LIMITS.WEBHOOK` |
| M | Are there provider restrictions that block the use case? | | e.g. business verification requirements, geographic restrictions |
| N | Do security/compliance requirements require architecture changes? | | e.g. data residency requiring a different hosting region |
| O | Are attachments/media supported? | | GCO's `Message` model has no attachment/media field today - if required, this is a schema change (`REQUIRES CODE`) |
| P | Are there limitations around conversation history? | | e.g. can GCO backfill history from before the integration was connected, or only see messages from activation onward |
| Q | Are there limitations around account ownership? | | e.g. who technically owns the provider account/API access - the client or GCO |
| R | Are sandbox/test credentials available? | | |

## Overall status

Choose exactly one, based on the worst individual classification above (a single BLOCKED row blocks the whole integration; a single REQUIRES CODE row means it cannot be called READY):

- **VERIFIED IMPLEMENTED** - built, deployed, and tested against this provider already.
- **INTEGRATION-READY / CLIENT-SPECIFIC** - the general mechanism (GCO's webhook ingestion + adapter interface) is proven; this specific provider's adapter has not been built.
- **REQUIRES TECHNICAL DISCOVERY** - not enough information yet to assess feasibility; discovery questions above are unanswered.
- **PLANNED** - assessed as feasible, not yet scheduled.
- **BLOCKED** - a specific, named blocker prevents proceeding (e.g. no API access, missing approval, client can't provide sandbox).

Never mark an integration VERIFIED IMPLEMENTED unless it has actually been built and tested against this provider.

## Sign-off

| | |
|---|---|
| Assessed by | |
| Date | |
| Reviewed against `docs/client-capability-matrix.md`? | |
