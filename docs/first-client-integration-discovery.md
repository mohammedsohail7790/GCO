# First Client Integration Discovery

The structured information GCO needs before any client-specific integration work begins. **Never request actual credential values here or anywhere in writing** - only the credential *type* is captured at this stage; real secrets are exchanged later through the secure mechanism in `docs/client-onboarding-checklist.md`.

Complete one copy of this document per prospective client integration.

## Client information

| Field | Answer |
|---|---|
| Client/company name | |
| Industry / use case | |
| Tenant name (as it should appear in GCO) | |
| Expected number of users/operators | |
| Expected conversation volume (daily/weekly) | |
| Expected daily message volume | |
| Expected peak volume | |
| Countries/regions served | |
| Languages required | |
| Operating hours | |
| Escalation requirements | |
| Data retention requirements | |
| Compliance requirements (GDPR, industry-specific, etc.) | |

## Provider information

| Field | Answer |
|---|---|
| Provider/platform | |
| Official API documentation (link) | |
| Official webhook documentation (link) | |
| API version | |
| Account type (e.g. Business, Developer, Enterprise tier) | |
| Environment (sandbox vs. production) | |
| Sandbox availability | |
| Production availability | |

## Authentication

Specify the **type** required, never the actual value:

- [ ] API key
- [ ] OAuth (specify scopes needed: ______)
- [ ] Bearer token
- [ ] HMAC-signed requests
- [ ] Signed webhook (specify signature method: ______)
- [ ] mTLS
- [ ] Other: ______

## Webhook

| Field | Answer |
|---|---|
| Webhook endpoint requirements (does the provider need a specific URL shape/verification handshake before it will send traffic?) | |
| Verification handshake (e.g. a challenge-response the provider requires before activating webhooks) | |
| Signature method (HMAC-SHA256, etc.) | |
| Signature header name(s) | |
| Timestamp requirements (does the provider include one, and does it expect the receiver to reject old timestamps?) | |
| Replay protection expected | |
| Event types the provider will send | |
| Provider's own retry behavior on delivery failure | |
| Timeout requirements (how fast must GCO's webhook endpoint respond?) | |
| Expected response codes the provider requires to consider delivery successful | |

## Messaging

| Field | Answer |
|---|---|
| Inbound message structure (paste a sample payload if available) | |
| Outbound message structure (what GCO must send to reply) | |
| Text support | |
| Media/attachment support | |
| Template message support (required by some providers, e.g. WhatsApp business-initiated messages) | |
| Reactions | |
| Delivery status events | |
| Read status events | |
| Typing indicators | |
| Conversation/thread ID concept | |
| User/contact ID concept | |

## Rate limits

| Field | Answer |
|---|---|
| Requests/minute | |
| Requests/second | |
| Burst limits | |
| Webhook delivery limits | |
| Concurrency limits | |
| Pagination limits (for any lookup/history API) | |

## Error handling

| Field | Answer |
|---|---|
| HTTP error codes the provider returns | |
| Provider-specific error codes/format | |
| Which errors are retryable vs. permanent | |
| Throttling behavior | |
| Authentication failure behavior | |
| Webhook failure behavior (what happens if GCO's endpoint is briefly down) | |

## Data model mapping

Map the provider's objects to GCO's existing model (`prisma/schema.prisma`) - do not invent new GCO concepts to force a fit; if something doesn't map cleanly, note it as a gap instead.

| Provider object | Maps to GCO |
|---|---|
| Account | `Tenant` |
| User/contact | `Conversation.externalUserId` |
| Conversation | `Conversation` |
| Message | `Message` |
| Attachment | *(not currently modeled - see Known Gaps below)* |
| Event | `WebhookEvent` |

## Security

| Field | Answer |
|---|---|
| What data is transferred (message content, contact info, order data, etc.)? | |
| Is PII involved? | |
| Data residency requirements | |
| Retention requirements | |
| Deletion requirements | |
| IP allowlisting required (by either side)? | |
| Audit requirements beyond GCO's existing audit log | |

## Operations

| Field | Answer |
|---|---|
| What monitoring does the client expect? | |
| What alerting does the client expect? | |
| Reconciliation requirements (does the client need to verify no messages were lost)? | |
| Replay/manual-recovery expectations | |
| Failure-visibility expectations (how should the client be told something failed?) | |

## Known platform gaps to weigh against this discovery

- **No per-integration association on `Conversation`/`Message`.** Today, `Conversation` and `Message` are scoped only by `tenantId`, not by which `Integration` (channel) they arrived through (see `prisma/schema.prisma` - neither model has an `integrationId` field). `workers/processors/outboundDelivery.ts` picks a tenant's outbound integration via `db.integration.findFirstOrThrow({ where: { tenantId, status: 'ACTIVE' } })` - the *first* active one, not necessarily the one the inbound message came from. **This is invisible and harmless for a client with exactly one active integration** (the only configuration ever built/tested), but it means **GCO cannot currently support a single tenant running two or more simultaneous live channels correctly** - a reply could route to the wrong provider. If this client's discovery reveals a need for multiple simultaneous channels from day one, that is a `REQUIRES CODE` item (add `integrationId` to `Conversation`, propagate through message creation and outbound delivery lookup) that must be scoped and built before that specific pilot - not assumed to already work.
- **Webhook-level dedup, not always per-event.** The webhook route's dedup key prefers a top-level `payload.event_id`/`payload.id`, falling back to a hash of the entire raw body (see `app/api/v1/webhooks/[integrationId]/route.ts`). A provider that batches multiple distinct events into one webhook delivery with only per-event IDs (no top-level event ID) will dedup at the *delivery* level, not the *event* level. Confirm during discovery whether the provider's webhook payloads carry a top-level event identifier; if not, this needs to be addressed as part of that provider's adapter implementation, not assumed away.

## Output

Once this document is complete, hand it to engineering alongside `docs/sales-to-engineering-handoff.md`. Engineering runs it through `docs/integration-feasibility-template.md` before any implementation estimate is given.
