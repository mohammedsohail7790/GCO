# GCO × Paxmod — Post-Discovery-Call Architecture Review

**Status: IMPLEMENTATION FROZEN.** This is an architecture/discovery document only. No code, schema, dependency, or configuration was changed to produce it. Repository HEAD: `930a146`.

**Why this document exists:** the Paxmod discovery call left one structural question open — whether GCO operators would work *inside* Paxmod's own platform (Scenario A) or whether Paxmod would send work *into* GCO's existing operator workflow (Scenario B). Paxmod will clarify this and provide API/spec/sandbox material later this week. Nothing below assumes an answer. No Paxmod API, webhook, payload, or auth scheme is assumed anywhere in this document — every capability attributed to Paxmod is phrased as a question to confirm, not a fact.

---

## 1–2. Current GCO Architecture — What Exists Today, By Area

| Area | Status | Evidence |
|---|---|---|
| **Operator workflow** | VERIFIED | `app/operator/page.tsx` + `GET /api/v1/operators/me/workspace` — an operator sees only their own active assignments, an SLA countdown, and can send. Fresh-verified live this session (login → assignment → AI draft → edit → send → delivered). |
| **Human review workflow** | VERIFIED | `lib/messages/send.ts::operatorSendMessage` is the sole code path that creates an outbound message — structurally requires an authenticated `OPERATOR` session holding the active assignment. No autonomous-send path exists anywhere in the codebase. |
| **Messages** | VERIFIED | `Message` model: `direction` (INBOUND/OUTBOUND), `status` state machine (RECEIVED → PENDING_REVIEW → SENT/DELIVERED/FAILED), idempotency via `(tenantId, externalMessageId, direction)` unique constraint. |
| **Queues** | VERIFIED | BullMQ, 6 named queues (`gco-message-ingest`, `gco-ai-suggestion`, `gco-memory-extraction`, `gco-outbound-delivery`, `gco-assignment-timeout`, `gco-analytics`) + dead-letter, 5 retries with exponential backoff, generic and adapter-agnostic. |
| **AI assistance** | VERIFIED (mock only) | `lib/ai/**` generates a draft reply from trimmed conversation context; never sends; mock provider fully tested, real OpenAI provider coded but never executed live (no credential). |
| **Integrations** | VERIFIED (interface + dev-mock), BLOCKED (real) | `lib/integrations/adapter.ts` defines `IntegrationAdapter` (`verifyWebhookSignature`, `normalizeInbound`, `sendOutbound`); only `dev-mock` is registered. No Paxmod adapter exists. |
| **Webhooks (inbound)** | VERIFIED (generic mechanism) | `app/api/v1/webhooks/[integrationId]/route.ts`: rate-limit → tenant-status check → message-cap check → HMAC verify → dedup → persist → enqueue. Signature scheme today is HMAC-SHA256, specific to `dev-mock` — Paxmod's real scheme is unknown. |
| **Outbound API (to a client platform)** | VERIFIED (generic mechanism), BLOCKED (real) | `workers/processors/outboundDelivery.ts` calls `adapter.sendOutbound()` expecting a **synchronous** `{ delivered, externalDeliveryId?, error? }` result. No asynchronous delivery-confirmation mechanism exists in the interface today. |
| **API boundaries** | VERIFIED | 23 REST routes under `/api/v1/`, Zod-validated, RBAC-gated, tenant-scoped. |
| **Authentication/authorization** | VERIFIED | Custom JWT (HS256), 5-role RBAC matrix (`lib/auth/rbac.ts`), tenant-scope resolver (`lib/auth/tenantGuard.ts`) that never trusts a client-supplied tenant ID. Directly attacked in tests (cross-tenant, cross-role) and held. |
| **Delivery/status tracking** | VERIFIED (mechanism), NOT VERIFIED (against any real platform) | `Message.status` + `MessageEvent` append-only trail; only ever exercised against `dev-mock`'s always-succeed simulated response. |
| **Audit/history** | VERIFIED | `AuditLog` (sensitive actions), `MessageEvent` (per-message lifecycle), `SystemEvent` (queue/dead-letter incidents) — all append-only, already used in admin recovery flows. |
| **Tenant boundaries** | VERIFIED | Every tenant-owned table carries `tenantId`; `Tenant.status` (ACTIVE/SUSPENDED/ARCHIVED) and `Tenant.messageCap` (a **soft, non-atomic** ceiling — not a hard limit) are both enforced. |
| **Paxmod's actual workflow, API, or platform capabilities** | **CLIENT-DEPENDENT — entirely unknown** | Nothing in this repository or conversation describes Paxmod's platform. Every claim about Paxmod below is a question, never a fact. |

---

## 3. Scenario A — Operators Work Inside Paxmod

**Workflow shape (candidate, not confirmed):** Paxmod remains the operator's primary interface. An operator reads and responds to conversations directly inside Paxmod's own dashboard/tooling. GCO's role would shrink to a supporting service — most plausibly, AI-suggestion generation and/or usage/SLA accounting — rather than the operator's actual workspace.

- **System of record:** Paxmod, for conversation state, message history, and operator identity/assignment. GCO would at most hold a mirrored or derived record for its own accounting/SLA purposes.
- **What GCO would potentially provide:** an AI-draft-suggestion capability Paxmod calls into (e.g., "give me a suggested reply for this conversation"), and/or usage/billing accounting if GCO remains the commercial layer. GCO's own operator workspace UI (`app/operator/page.tsx`) would likely go unused in this scenario.
- **Data movement:** Paxmod would need to send GCO enough conversation context to draft a reply (recent messages, language, any client instructions) and GCO would need to send back a suggested reply — the reverse of GCO's current inbound-webhook shape. This is architecturally closer to GCO exposing an API *to* Paxmod than Paxmod calling *into* GCO's ingestion pipeline.
- **Inbound events/webhooks into GCO:** Possibly none, or a much narrower one (e.g., "conversation updated" just to keep an AI-context cache warm) — genuinely unclear until Paxmod describes their model.
- **Outbound APIs from GCO:** Very likely required — an API Paxmod calls synchronously to request a draft suggestion. This does not exist in GCO today; `lib/ai/**` is only ever invoked internally by GCO's own queue, never exposed as a callable external API.
- **Authentication:** Unknown which direction needs which scheme — Paxmod calling GCO would need GCO to issue Paxmod credentials (nothing like this exists today; GCO's current auth model is for GCO's own users, not for a partner platform calling in).
- **Operator actions remaining in Paxmod:** Read conversation, write/send reply, most likely all operator-facing actions entirely — GCO would have no visibility into or control over the actual send.
- **What GCO would need to receive:** Conversation context sufficient for a coherent AI draft (recent message history, external user identity for continuity, language).
- **What GCO might need to send back:** A suggested reply plus confidence/reasoning metadata (already GCO's existing `AiGeneration` shape internally — but never exposed as an external API response today).
- **Known vs. unknown:** Known — GCO's AI-generation mechanism exists and works (mock only). Unknown — everything about how Paxmod would call it, whether Paxmod even wants AI-only involvement, whether GCO's human-approval structural guarantee ("AI never sends") still applies or becomes Paxmod's own responsibility to enforce.
- **Paxmod capabilities that would need confirming before implementation:** Does Paxmod have an extensibility/plugin/API surface for a third party to inject a suggested reply into their operator UI? Can Paxmod call an external API synchronously during an operator's workflow? What context can Paxmod actually supply (do they have "recent messages," "language," etc. available to send)?

## 4. Scenario B — Paxmod Integrates With GCO

**Workflow shape (candidate, not confirmed):** This is the shape GCO's existing architecture is already built for. Paxmod sends inbound conversation events to GCO via webhook; GCO's existing pipeline (queue → assignment → SLA → AI draft → human review) runs exactly as it does today; a GCO operator sends the approved reply; GCO calls back out to Paxmod to deliver it.

- **Moderation/review queue location:** Inside GCO — `Conversation`/`Assignment` tables, GCO's existing operator workspace, unchanged.
- **How Paxmod could send work into GCO:** Via the existing `POST /api/v1/webhooks/{integrationId}` boundary, provided a **new adapter** is written against Paxmod's real webhook shape (`lib/integrations/adapters/`). No new inbound route needed — the boundary already exists, only the adapter implementation would be new.
- **How GCO operators review:** Exactly as today — `app/operator/page.tsx`, unchanged.
- **How operator decisions flow back:** Via the existing `POST /messages/send` → `workers/processors/outboundDelivery.ts` → `adapter.sendOutbound()` path, provided the same new adapter implements a real call to Paxmod's outbound API.
- **What GCO needs from Paxmod:** Real API documentation, webhook signing scheme, real payload examples, conversation/user ID semantics, delivery-status model (see the discovery checklist in §5).
- **What Paxmod would need from GCO:** A stable webhook endpoint to call, GCO's signature-verification expectations if Paxmod wants to validate anything GCO sends back, and clarity on GCO's own delivery-confirmation shape.
- **API/webhook direction:** Paxmod → GCO (inbound webhook) and GCO → Paxmod (outbound send call) — this is the two-way shape GCO's `IntegrationAdapter` interface already models.
- **Authentication requiring confirmation:** What scheme Paxmod requires for GCO's outbound calls to them (API key/OAuth2/mTLS/other — entirely unknown today).
- **Delivery/status semantics requiring confirmation:** Whether Paxmod confirms delivery synchronously (fits GCO's current interface as-is) or asynchronously via a later callback (does **not** fit GCO's current interface — would need an approved, explicit addition).
- **What would need to be built vs. configured:** Built — one new adapter file (`lib/integrations/adapters/paxmod.ts`) implementing the three interface methods against Paxmod's real contract. Configured — a new `Integration` row (`adapterKey`, `config`, `secretRef`) and registering the adapter in `lib/integrations/registry.ts`. Neither touches the core pipeline if Paxmod's real behavior fits the existing interface assumptions (see the known interface gaps below).
- **What remains unknown until Paxmod documents it:** Whether Paxmod's conversation/user-identity model matches GCO's "most recent non-closed conversation per external user" assumption; whether delivery confirmation is sync or async; whether media/attachments are involved; real webhook signing scheme; real expected traffic volume.

---

## 5. Comparison Table

| Area | Scenario A: Operators in Paxmod | Scenario B: Paxmod → GCO |
|---|---|---|
| System of record | Paxmod (conversations, operator identity) | GCO (`Conversation`, `Assignment`, `Message`) |
| Operator UI | Paxmod's own dashboard | GCO's existing `app/operator/page.tsx`, unchanged |
| Message ingestion | Unclear — possibly none, or a narrow context-sync event | GCO's existing webhook boundary, new adapter only |
| Review workflow | Lives entirely in Paxmod, outside GCO's visibility | GCO's existing assignment/SLA/review flow, unchanged |
| Human decision | Made and executed in Paxmod | Made and executed in GCO (`operatorSendMessage`, unchanged) |
| AI assistance | GCO would need to expose AI drafting as a **new external API** — does not exist today | GCO's existing internal AI pipeline, unchanged |
| API dependency | New: an inbound API on GCO callable by Paxmod | New: an outbound call from GCO's existing worker to Paxmod's real send API |
| Webhook dependency | Likely minimal or none | Required — Paxmod's real webhook signing/payload/delivery model, entirely unconfirmed |
| Authentication | Unknown direction/scheme; GCO has no "issue credentials to a partner platform" mechanism today | Standard adapter-config credential pattern GCO's interface already anticipates (`Integration.config`/`secretRef`), scheme itself unconfirmed |
| Status/delivery | GCO likely has no visibility into final delivery at all | GCO's existing `Message.status` mechanism, contingent on Paxmod's real delivery-confirmation model (sync vs. async — unconfirmed) |
| Audit/history | Fragmented — Paxmod holds the real history, GCO only what it's told | Unified — GCO's existing `MessageEvent`/`AuditLog`, unchanged |
| GCO changes likely required | New external-facing AI API (does not exist); possibly no use for GCO's operator UI, assignment, or SLA logic at all | One new adapter file; possibly a delivery-status interface addition if Paxmod's confirmation is async |
| Paxmod dependency | High — Paxmod must expose an extensibility point for a third-party AI suggestion; unconfirmed this exists at all | High — Paxmod must expose inbound webhook delivery and an outbound send API; unconfirmed shape |
| Main technical risk | GCO's core value proposition (human-approval-enforced send, SLA, assignment) may not transfer if operators never touch GCO at all | Paxmod's real conversation/identity/delivery semantics may not match GCO's built-in assumptions, requiring an approved interface change before an adapter can be finished |

---

## 6. Minimum Information Needed From Paxmod (Prioritized)

**Tier 1 — decides which scenario even applies:**
1. Where does Paxmod expect the operator to actually work — inside Paxmod's UI, or somewhere else? (This is the single fact that resolves Scenario A vs. B.)
2. Does Paxmod have any API surface at all for a third party to either (a) inject a suggested reply into their operator flow, or (b) send/receive conversation events? Without this, neither scenario is buildable.

**Tier 2 — required regardless of which scenario is chosen:**
3. API documentation (REST/webhook/other), with sandbox and production base URLs.
4. Authentication method for calls made in either direction.
5. Message ingestion mechanism — webhook push from Paxmod, or does GCO/Paxmod need to poll?
6. Real payload structure (not schema-only) for whatever data crosses the boundary.
7. Moderation result/decision API — how does a human decision (the reply, or "approved"/"rejected") get communicated back to Paxmod?
8. Delivery/status callback model — synchronous response or asynchronous webhook?
9. Operator/user model — does Paxmod have its own operator concept that would need to map onto GCO's, or vice versa?
10. Permissions — what access would GCO's calls (or Paxmod's calls) actually be authorized to do?

**Tier 3 — needed before finalizing scope, not before starting discovery:**
11. Rate limits (both directions).
12. Retry/idempotency semantics — at-least-once or at-most-once delivery, stable event IDs.
13. Message history/context — how much prior conversation context can Paxmod supply or does GCO need to retain?
14. Supported media/content types — GCO has zero media support today; this determines new scope either way.
15. Tenant/game separation — how Paxmod's own multi-tenancy (if any) maps onto GCO's tenant model.
16. Data retention/privacy constraints.
17. Expected pilot volume — needed to size a `messageCap` (a soft ceiling, not a hard one) regardless of scenario.

---

## 7. Realistic 3-Day Pilot — Shape Only, Not Scoped Yet

**Pilot objective:** Prove the chosen workflow (once Scenario A or B is actually confirmed) end-to-end on a small, controlled slice of real Paxmod traffic — not a comprehensive rollout.

**Candidate workflow:** Entirely dependent on which scenario is confirmed — cannot be described more specifically than the two scenario sketches above without Paxmod's answer.

**Inputs required before the pilot can be designed at all:** All of Tier 1–2 from §6, at minimum — a pilot cannot be scoped against an unconfirmed architecture.

**Technical dependencies:** A real adapter (Scenario B) or a real external-facing AI API (Scenario A) — neither exists today; both are new engineering, gated on Paxmod's real spec.

**What would be configured (not built):** A dedicated pilot `Tenant`, operator/user accounts, a `Tenant.messageCap` sized with headroom above Paxmod's stated expected volume — all of this machinery already exists and works today, regardless of scenario.

**What would potentially require implementation:** The scenario-specific adapter or API (see above); possibly a delivery-status interface addition if Paxmod's confirmation model doesn't fit GCO's current synchronous-only assumption.

**Success criteria:** Cannot be meaningfully defined yet beyond generic placeholders (no data loss, no cross-tenant leakage, usage/SLA figures reconcile) — real success criteria should come from what Paxmod and GCO agree matters, once the workflow is known.

**Evidence to collect during the pilot:** Fresh test results specific to the real adapter (contract tests + sandbox round-trip), usage/SLA figures from GCO's existing analytics endpoints, any dead-letter/audit entries, and — critically — whichever side (Paxmod or GCO operators) actually executed the workflow, confirmed against what was intended.

**What would make the pilot BLOCKED:** Any of: no sandbox access ever materializes; Paxmod's real workflow turns out to require something GCO's interface cannot represent without a core change that hasn't been approved; Paxmod's expected volume is unknown at pilot time, making `messageCap` unsizeable; the scenario itself remains undecided.

---

## 8. Recommended Position for the Next Conversation With Cristian

**We should not choose Scenario A or Scenario B until Paxmod confirms:**
1. Where their operators actually work (inside Paxmod, or expecting a separate tool) — this alone decides the scenario.
2. Whether Paxmod has any API/webhook surface at all, and in which direction it can be called.
3. Their real authentication, payload, and delivery-confirmation model.

Until those three things are confirmed, any architecture decision would be a guess dressed up as a plan. GCO's existing platform is fully built and tested for Scenario B's shape specifically — but that is not a reason to assume Scenario B is correct; it is only evidence that Scenario B would be the smaller lift *if* it turns out to be what Paxmod actually wants.

---

## WHAT I SHOULD TELL CRISTIAN

"I went through GCO's architecture in detail and mapped out both ways this could go with Paxmod — either their operators keep working inside Paxmod's own platform and GCO mainly supplies AI suggestions from the outside, or Paxmod sends conversations into GCO and our own operators handle them the way GCO already works today. GCO's current system is fully built and tested for the second shape — queuing, assignment, SLA, AI drafting, human-approved sending, all of it — but that's not the same as knowing that's what Paxmod actually wants or can support. The real blocker right now is that we don't yet know where Paxmod expects the operator to sit, or what their API even looks like — so I haven't touched any code, and I'm not going to guess. Once Paxmod tells us that and shares their API/spec/sandbox, we can actually design the integration properly and scope a real 3-day pilot around it, instead of building something that might not match how they actually work."

---

## NEXT ACTIONS

**NOW — safely doable without Paxmod:**
- Keep this document as the shared reference for the next call.
- Prepare the Tier 1–2 questions from §6 as the explicit agenda for Paxmod's follow-up.
- No code, schema, or dependency changes — none are justified yet.

**WAITING FOR PAXMOD — information required:**
- Which scenario matches their actual intended workflow (operators in Paxmod, or Paxmod into GCO).
- API documentation, sandbox access, authentication scheme, real payload examples, delivery-status model, expected volume — the full Tier 1–3 list in §6.

**AFTER PAXMOD MATERIAL ARRIVES — engineering steps:**
1. Map their real answers onto Scenario A or B (or a hybrid, if their answer doesn't cleanly fit either).
2. Identify any gap the current `IntegrationAdapter` interface (or a new external-facing API, if Scenario A) cannot represent — flag for explicit approval before touching anything.
3. Only then design and implement, per the existing `gco-integration` skill's client-spec gate.

---

## Repository Verification

- **Files modified:** none.
- **Files created:** this document only — `docs/GCO_PAXMOD_ARCHITECTURE_DISCOVERY_REVIEW.md`.
- **Application code changed:** no.
- **Implementation performed:** no — no adapter, no API, no schema, no dependency.
- **Committed:** no.
- **Pushed:** no.

**IMPLEMENTATION STATUS: FROZEN**
