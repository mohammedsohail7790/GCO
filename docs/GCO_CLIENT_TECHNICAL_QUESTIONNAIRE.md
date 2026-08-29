# GCO — Client Technical Questionnaire

**Purpose.** This is the generic, client-agnostic technical questionnaire GCO sends a prospective first client before any integration work begins. It is the operational input gate for **PHASE 3 (Client-Specific Integration)** in `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §26.

Every question is grounded in a specific gap or assumption in the current codebase (cross-referenced to `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md` §10 and the V1 draft §20). Every "Why GCO needs this" is a concrete engineering reason, not a generic checklist item. No client is named anywhere in this document; it must stay generic.

Answers should be real payloads and behaviors, not diagram-level descriptions — GCO writes adapter code against real shapes, never against assumptions.

---

## A. API surface

**Question:** Do you have a documented API? What shape is it (REST, GraphQL, webhook-first, other)? List the base URL(s) for sandbox and production.

**Why GCO needs this:** GCO sits on the boundary where your system is the source of inbound conversations. `IntegrationAdapter.normalizeInbound()` must be written against your real request/response shape before any traffic can flow; nothing can be assumed. Separate sandbox and production URLs let GCO build against the same interface it will validate against in the pilot.

---

## B. Authentication (for calls GCO makes to you)

**Question:** What authentication method do you require for calls GCO makes *to* your system (API key, OAuth2, mTLS, other)? How are credentials delivered and rotated?

**Why GCO needs this:** `IntegrationAdapter.sendOutbound()`'s config is currently unused by the `dev-mock` adapter (audit §10). A real adapter must implement a concrete auth scheme, and credential rotation must be understood before first production use.

---

## C. Webhook signature method (for calls you make to GCO)

**Question:** How do you sign webhook deliveries to GCO? Do you support a custom signature header? Describe the exact signing algorithm and where the shared secret is configured.

**Why GCO needs this:** GCO's inbound webhook verification is currently HMAC-SHA256 specifically for the `dev-mock` contract, and the forged-signature rejection is a tested security control (`02-webhook-integrity.spec.ts`). Your signing scheme must map exactly onto that verification boundary or the verified integrity guarantee at the entry point of the system is lost.

---

## D. Inbound message payload

**Question:** Show real inbound message payload examples (not a schema). Which fields are guaranteed vs. optional? Can text be empty? Are system messages possible? How are timestamps represented (format and timezone)?

**Why GCO needs this:** `normalizeInbound()` must parse real edge cases — empty text, system messages, timestamp semantics — or messages will be mis-queued or mis-dated. The audit flags that only schema-level shape, not real payloads, is assumed today; this is where malformed-payload handling (already verified to return 400) is tuned.

---

## E. Outbound message API

**Question:** What API does GCO call to send a reply? Is the response synchronous (send accepted) or asynchronous (ack via webhook or polling)? What fields must a valid outbound request contain?

**Why GCO needs this:** GCO's outbound path (`lib/messages/outboundDelivery.ts`) currently always-succeeds against the mock. GCO only ever sends what a human operator approves, and it must know how to represent that send to you — and how to confirm it actually happened (§J).

---

## F. Conversation / thread identity

**Question:** Do you have a stable conversation or thread identifier? How is a *new* conversation distinguished from a *continuing* conversation for the same external user?

**Why GCO needs this:** GCO's core model is built on a stable `externalUserId`/`externalMessageId` and a conversation-continuity assumption: `ingestOneMessage()` reuses the "most recent non-closed conversation" for a given external user (`lib/messages/ingest.ts`). Your actual ID semantics must be validated against that assumption or conversations will be fragmented or wrongly merged.

---

## G. Attachments / media

**Question:** Can messages include images, files, or other media? In what format (URL, base64, separate upload endpoint)? Can **you** receive media in outbound replies?

**Why GCO needs this:** GCO currently has **zero media handling** (audit §31). Media support is substantial new work (schema + adapter interface + storage), not configuration. Your answer determines whether that is in scope for V1 or cleanly deferred.

---

## H. Rate limits (both directions)

**Question:** What rate limits do you impose on calls GCO makes to you? Should you know GCO's inbound limits, and do you need advance notice of GCO's webhook delivery rate?

**Why GCO needs this:** GCO's inbound webhook limit is 3000/min per integration (`lib/api/rateLimit.ts`). Your expected inbound volume and your own outbound-call limits must be sized against that so the adapter paces correctly and neither side trips a limit during the pilot.

---

## I. Error / retry behavior

**Question:** What error codes do you return and what do they mean? Do you retry failed webhook deliveries to GCO, and with what backoff and how many attempts?

**Why GCO needs this:** GCO's error-classification and dead-letter layers map external failures to queue behavior. Your error semantics must map onto that classification or retries will be mis-directed (audit §33–§35). Your delivery-retry policy also determines how GCO deduplicates repeats (already proven under exact-duplicate delivery).

---

## J. Delivery status / confirmation

**Question:** How does GCO learn whether an outbound message was actually delivered — synchronous response, asynchronous webhook, or polling? What is the delivery-status taxonomy?

**Why GCO needs this:** The outbound path's "always succeeds" mock must be replaced with your real confirmation mechanism (audit §10, §16–§17). Whether delivery is eventually-consistent matters to how GCO reports "sent" vs. "delivered" in manager analytics and the usage ledger.

---

## K. Operator visibility of your channels

**Question:** Does your system need operator identity or handling metadata surfaced anywhere? Any operator-side requirements (e.g. must a reply carry a sender name)?

**Why GCO needs this:** GCO currently strips operator identity fields from client-visible payloads (a tested boundary, `05-tenant-isolation.spec.ts`). If you need sender attribution, that is a deliberate, tested boundary change, not an implicit one.

---

## L. Languages

**Question:** What languages does your platform operate in? Is there a per-conversation language signal GCO should expect?

**Why GCO needs this:** Language enforcement does not exist yet in GCO, and is deferred in V1 (§24). Knowing whether your traffic is single-language or needs per-conversation handling tells GCO whether this stays deferrable configuration or becomes required capability.

---

## M. Business / routing rules

**Question:** Are there any conversation-routing or handling rules specific to your platform that GCO must honor?

**Why GCO needs this:** V1's explicit non-goal is "highly customized per-client workflows" — client-specific logic belongs in the adapter boundary, not the core (§25). Your rules must be enumerable now so GCO can decide whether they fit inside the adapter or genuinely need core changes (unlikely, and important to know early).

---

## N. Operating hours

**Question:** Does your traffic need to be handled within specific hours, or is it 24/7? Any SLA implications from your side?

**Why GCO needs this:** GCO has no operating-hours enforcement and it is deferred in V1 (§24). Whether pilot traffic is 24/7 (no enforcement needed) vs. time-boxed (may need scheduling) determines whether this stays deferred or becomes pilot-relevant.

---

## O. Escalation & expected traffic

**Question:** Do you need an escalation path beyond GCO's standard SLA reassignment (which already requeues unanswered assignments on expiry)? What is your expected peak and average message volume?

**Why GCO needs this:** Expected volume is the number GCO sizes pilot controls against — the message-volume cap GCO now enforces (`lib/tenant/activity.ts`) must be set above your real peak or you will self-throttle; set too loose and "controlled pilot" loses meaning. The escalation answer determines whether the existing SLA-reassignment mechanism suffices or a client-specific escalation is wanted.

---

## CLIENT TECHNICAL READINESS CHECKLIST

Complete all 16 before GCO begins adapter development (PHASE 3). Every box maps to a specific answer above; GCO treats any unchecked box as a blocker to writing adapter code against *real* shapes.

- [ ] **1.** Full API documentation provided for sandbox and production (A).
- [ ] **2.** Base URL(s) for sandbox and production environments confirmed (A).
- [ ] **3.** Authentication method for GCO's outbound calls specified, with credential exchange process (B).
- [ ] **4.** Webhook signature algorithm and secret configuration documented (C).
- [ ] **5.** Real (not schema-only) inbound message payload examples provided (D).
- [ ] **6.** Timestamp format and timezone confirmed (D).
- [ ] **7.** Outbound message API contract documented (E).
- [ ] **8.** Stable conversation/thread identity semantics confirmed, incl. new-vs-continuing distinction (F).
- [ ] **9.** Attachment/media capability and format stated (G) — determines V1 scope.
- [ ] **10.** Rate limits on GCO's outbound calls and expected inbound volume shared (H, O).
- [ ] **11.** Error-code taxonomy and delivery-retry policy documented (I).
- [ ] **12.** Outbound delivery-status mechanism confirmed (J).
- [ ] **13.** Operator identity / sender-attribution requirement stated, or confirmed not needed (K).
- [ ] **14.** Language model confirmed (single vs. multi, per-conversation signal) (L).
- [ ] **15.** Operating-hours requirement stated, or confirmed 24/7 (N).
- [ ] **16.** Sandbox access provisioned and production credential exchange channel confirmed (U/V path, §B, §S).
