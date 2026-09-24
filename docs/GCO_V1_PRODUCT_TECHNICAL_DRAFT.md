# GCO V1 — Product & Technical Draft

Built directly from `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md` (audit date 2026-08-28). This document does not redesign anything — it takes the audit's VERIFIED/PARTIAL/MISSING/BLOCKED/NOT VERIFIED findings and organizes them into a focused V1 scope, a generic pilot model, and an onboarding path. No client (including DOWN4app) is assumed anywhere below. No code was touched to produce this document.

---

## Section 1 — Executive Product Definition

**What is GCO?** A multi-tenant platform that sits between a client's incoming message traffic and a team of human operators, using AI to draft — never send — suggested replies, so operators can respond faster without losing the judgment a human provides.

**Who uses it?** Four roles, all already implemented and RBAC-verified: a platform operator (CEO_ADMIN) who runs GCO itself, a manager who oversees a client's operation, an operator who handles conversations, and a client user who watches their own tenant's activity.

**What problem does it solve?** High-volume conversational traffic (the audit confirms the architecture is built for this, not proven at scale — see §14/§23) needs to be triaged, assigned fairly, answered inside a time budget, and accounted for — without losing messages, double-sending, or leaking one client's conversations to another.

**Core workflow (verified end-to-end by the audit, §0/§3 of the audit doc)**: message arrives → durably queued → race-safely assigned to an available operator under a server-side SLA clock → AI drafts a reply → operator reviews/edits/sends → delivery is tracked → usage is recorded against an exact per-message price.

**What value does it provide?** Faster operator response (AI draft instead of blank page), enforced service levels (server-side timer, not operator honor system), auditable billing (idempotent usage ledger, exact business-model math already test-verified), and tenant-safe operation (isolation independently attacked and held).

**What makes GCO different from "connect an API to a dashboard"?** Three things the audit specifically confirmed are real, not aspirational: (1) assignment is race-safe at the database level, not a UI convention; (2) the AI never sends — a human always does, structurally enforced by there being exactly one code path that creates an outbound message; (3) every message's usage is idempotency-keyed, so duplicate webhook delivery (which real integrations do) cannot double-bill a client.

---

## Section 2 — Current → V1 Gap

Pulled directly from the audit, not re-assessed.

**CURRENTLY VERIFIED** (already works, already tested): webhook ingestion + HMAC + dedup; message idempotency; race-safe assignment; SLA timer + auto-reassignment; AI suggestion generation (mock provider); human-only send; outbound delivery (dev-mock adapter); usage ledger math; tenant isolation (incl. WebSocket); RBAC for all 5 roles; session/token security; dead-letter capture + recovery; realtime push with polling fallback; structured logging + health endpoints; safe error handling.

**CURRENTLY PARTIAL**: rate limiting (3 of 23 routes); user/tenant lifecycle (create-only, no deactivate/suspend enforcement); manager/client analytics (basic counts, no depth); notes (read-only, no creation path); AI memory (extraction works, correction doesn't); language configuration (field exists, unenforced).

**CURRENTLY MISSING**: real client integration (by design — no spec exists); operator performance metrics (schema table, zero code uses it); operator compensation calculation (doesn't exist — only company-side cost tracking exists); media/attachment handling; operating-hour controls; traffic segmentation within one tenant; pilot volume caps; enforced tenant suspend/terminate; charts/graphs anywhere; real error tracking.

**REQUIRED FOR GCO V1** (the genuinely necessary subset — justified individually in §24):
- Rate-limit coverage extended to the routes a real client's own users would call, not just login/webhook/send.
- `Tenant.status` actually enforced (currently inert) — needed to safely suspend or stop any tenant, pilot or otherwise.
- A message-volume cap mechanism, since none exists and a first controlled engagement needs one.
- The client-specific `IntegrationAdapter`, once a spec exists — architecturally ready, zero client code exists yet.

**CAN BE DEFERRED**: operator performance metrics beyond raw counts; charts/graphs; manager conversation drill-down; note-taking API; AI memory correction; per-operator compensation calculation (unless confirmed part of the near-term business model); media/attachments and operating-hours/language enforcement (unless the first real client's platform requires them — unknown until their spec arrives); real error tracking (Sentry); CI pipeline execution; Docker-based deployment (direct-process deployment is already verified and sufficient for a controlled pilot).

---

## Section 3 — GCO V1 Core Workflow

The audit confirms the actual architecture matches the canonical flow closely, with one clarification: AI suggestion generation and memory extraction happen in parallel with assignment, not strictly after it, and realtime updates fire at multiple points throughout, not only at the end. Stage-by-stage:

| Stage | Current implementation | V1 requirement | Missing work | Reliability requirement | Security requirement |
|---|---|---|---|---|---|
| External Client/System | N/A — no real client connected | Client sends webhooks per their own spec | Everything (BLOCKED — no spec) | N/A yet | N/A yet |
| Integration Adapter | `dev-mock` only | A real adapter matching `IntegrationAdapter` interface | Client-specific adapter code | Adapter must not crash core pipeline on malformed input | Signature verification per client's actual scheme |
| Webhook/API Ingestion | VERIFIED — persist-then-enqueue, never blocks on downstream work | Same pattern for any new adapter | None — pattern is adapter-agnostic | Fast ack regardless of queue/DB load | Rate limiting (currently present on this route) |
| Authentication + Validation | VERIFIED — HMAC, timing-safe compare, Zod body validation | Same | None | Malformed payload → 400, never 500 (verified fixed) | Reject before persisting anything on invalid signature |
| Tenant Identification | VERIFIED — via `Integration.tenantId` | Same | None | N/A | Never trust a client-supplied tenant identifier |
| Message Persistence | VERIFIED — idempotent unique constraint | Same | None | Duplicate delivery is a no-op, verified (with one flaky-run caveat, audit §16) | Tenant-scoped write |
| Queue | VERIFIED — BullMQ, 6 queues + dead-letter | Same | None | Retry + backoff + dead-letter, all verified | N/A |
| Assignment/Routing | VERIFIED — transactional conditional update | Same | None | No double-assignment, DB-constraint-backed | Tenant-scoped operator pool only |
| SLA/Priority | VERIFIED (SLA) — PARTIAL (priority: `Conversation.priority` field exists, only used for sweep ordering, no client-facing priority concept) | SLA as-is; priority likely sufficient for V1 as an internal ordering hint | Client-facing priority config, if needed | Server-side deadline, immune to client state | N/A |
| Operator Workspace | VERIFIED | Same | None functionally required | Polling fallback keeps it working if realtime fails | Operator sees only their own assigned conversations |
| AI Assistance | VERIFIED (mock) — BLOCKED (real provider, no key) | Mock is acceptable for V1/pilot; real provider when a key exists | Nothing structurally — just a credential | Never blocks manual reply on failure (verified) | AI output never trusted without human review |
| Human Review | VERIFIED — structurally the only send path | Same | None | N/A | N/A |
| Outbound Response | VERIFIED (dev-mock) — MISSING (real client) | Real adapter's send method | Client-specific outbound logic | Retry + backoff + dead-letter (generic, already built) | N/A until real adapter exists |
| External Client/System (receive) | N/A | Depends on client's delivery contract | Everything (BLOCKED) | N/A | N/A |
| Delivery Confirmation | VERIFIED mechanism, PARTIAL real signal (mock always succeeds) | Real delivery-status handling once client spec exists | Client-specific status mapping | N/A until real adapter | N/A |
| Usage Ledger | VERIFIED, exact business-model math tested | Same | None | Idempotency-keyed, verified | Margin figures gated by permission, verified |
| Analytics/KPI | PARTIAL — basic counts exist, no depth | Basic counts are sufficient for V1 (§16) | Depth, if needed later | N/A | Tenant-scoped |
| Realtime Updates | VERIFIED — ticket-authenticated, cross-tenant-isolated, polling fallback always active | Same | None | DB remains authoritative; realtime never the only signal | Verified isolated, §9 |

---

## Section 4 — User Roles

Matches the existing RBAC implementation exactly (`lib/auth/rbac.ts`, verified by the audit's fresh `06-rbac.spec.ts` run) — no new permissions invented here.

**SUPER ADMIN (CEO_ADMIN)** — Purpose: runs GCO itself, not any one client's operation. Permissions: tenant management, user management (all roles), system health, audit logs, dead-letter recovery. Sees: everything, globally. Modifies: tenants, users, system configuration. Cannot access: nothing is restricted from this role by design — it is the platform operator role. Tenant boundary: none — global by design, confirmed in the audit as one of two roles with no `tenantId` of its own.

**MANAGER** — Purpose: oversees one client's day-to-day operation. Permissions: view operator roster/workload, analytics for their own tenant, reassign conversations. Sees: their own tenant's operators, conversations metadata, SLA/queue metrics. Modifies: assignment (manual reassignment). Cannot access: other tenants (verified), CEO_ADMIN-only actions (tenant creation, user creation — verified blocked). Tenant boundary: pinned to one tenant.

**OPERATOR** — Purpose: handles assigned conversations. Permissions: view own assigned work, send messages, set own availability. Sees: their own assigned conversations only. Modifies: only their own conversation state via sending a reply. Cannot access: other operators' work, manager/admin functionality, other tenants. Tenant boundary: pinned to one tenant.

**CLIENT** — Purpose: the paying customer's own visibility into their tenant. Permissions: view usage summary, submit/view own tickets. Sees: their own tenant's usage figures and tickets only — explicitly confirmed NOT to see operator identity (fixed and regression-tested per the audit). Modifies: submits tickets. Cannot access: any other tenant, any admin/manager functionality, margin/revenue figures (gated separately even within their own tenant's usage view). Tenant boundary: pinned to one tenant.

**ASSISTANT** (present in the codebase, worth naming since it's part of the existing matrix) — a global operational role like CEO_ADMIN but with narrower permissions (queue recovery, ticket management, system health) — not asked for in this section's four roles, but excluding it here would misstate what already exists.

---

## Section 5 — Operator Workspace

Per the audit (§6, §12 of the audit doc), every item in the prompt's list already exists and works:

| Capability | Status |
|---|---|
| Authenticate | VERIFIED |
| See assigned conversations | VERIFIED |
| Understand priority/SLA | VERIFIED (SLA); priority is an internal sweep-ordering hint, not a surfaced UI concept — acceptable for V1 |
| Read conversation history | VERIFIED |
| Receive AI assistance | VERIFIED (mock) |
| Review/edit AI suggestions | VERIFIED |
| Send responses | VERIFIED |
| See message status | PARTIAL — delivery status is tracked in the data model; not explicitly surfaced as a distinct UI element beyond the message appearing in the thread |
| See workload information | PARTIAL — sees their own active/queued conversation, not a broader workload summary (e.g. "3 handled today") — audit confirms no message-count display exists on the operator page |
| Handle failures gracefully | VERIFIED — AI failure never blocks manual send (verified); network/API failures surface as a UI error state (added and regression-tested per the audit) |

**Nothing here requires new engineering for V1.** The two PARTIAL items (message status visibility, workload summary) are cosmetic gaps, not functional ones — the underlying data exists.

---

## Section 6 — Manager Workspace

Per the audit, already built: operator roster, availability/status, load (active/capacity), queue size, active conversations, SLA breach count, average response time — all VERIFIED, all tenant-scoped, all RBAC-gated correctly (MANAGER cannot see CEO_ADMIN-only data, verified).

**Missing, and deliberately not required for V1 per this section's own instruction not to force graphs**: conversation drill-down UI (data is API-accessible, no screen exists), per-operator historical trend (`OperatorMetricSnapshot` is schema-only), any charting.

**V1 decision**: the manager panel as it exists today — operational stat cards plus an operator roster table — is sufficient for actionable day-to-day operation. A manager can already see who's overloaded, whether SLA is being breached, and how big the queue is. Drill-down and trend charts are explicitly deferred (§25).

---

## Section 7 — Super Admin

Already built and verified: tenant creation/listing, user creation (all roles), system health (DB/Redis/queue status), audit log storage, dead-letter recovery (API-level).

**Gaps, named honestly**: no dedicated admin UI for user creation or audit-log viewing (API exists, no screen) — an admin can operate via direct API calls today, which is workable for a small number of controlled tenants but not scalable UX. No runtime feature-flag toggle (flags are env-var-only). No tenant-status enforcement (§2).

**V1 decision**: for a first client and pilot, admin operations via existing API endpoints (which are fully functional, just not wrapped in extra UI) are sufficient. A minimal admin-panel form for user creation and audit-log viewing is a reasonable SHOULD HAVE (§24), not a MUST HAVE, given the API already works.

---

## Section 8 — Client Portal

Already built: tenant-isolated login, usage summary (message count + spend, date-range filterable), ticket submission/viewing.

**CLIENT DATA** (already correctly exposed): their own usage figures, their own tickets.
**GCO INTERNAL DATA** (already correctly withheld, verified): other tenants' anything; operator identity/internal fields (specifically tested and confirmed stripped from any endpoint a CLIENT can reach); margin/founder-revenue figures (gated by a separate permission even within their own usage data).

**Not currently exposed, worth a V1 decision**: conversation-level visibility. The underlying API (`GET /conversations`) is technically reachable by CLIENT role and tenant-scoped correctly, but no client-panel screen surfaces it. **V1 recommendation**: defer — a client seeing raw conversation transcripts is a larger product/privacy decision than this document should make unilaterally, and the audit found no existing UI for it either way.

---

## Section 9 — Multi-Tenancy

**Tenant identification**: `Tenant.id`, resolved server-side via `lib/auth/tenantGuard.ts::resolveTenantScope` — never trusts a client-supplied tenant identifier (verified: a CLIENT session's own `tenantId` always wins over any value supplied in a request).

**Tenant-scoped**: users, operators, conversations/messages, integrations, usage records, tickets, audit logs — every one of these carries a `tenantId` column, confirmed by the audit's database section.

**Tenant-scoped AI configuration**: PARTIAL — the code path exists (`clientInstructions` field passed to the AI prompt) but nothing currently sets a per-tenant value; effectively unused in practice today.

**Tenant-scoped realtime**: VERIFIED — the audit's freshest and most directly-attacked finding: two live tenants, two live WebSocket connections, one tenant-scoped webhook fired, the other tenant's socket received zero events. Backed by `tests/e2e/11-realtime-security.spec.ts`.

**Security requirement — NO TENANT MAY ACCESS ANOTHER TENANT'S DATA**: attacked via query params, path params, guessed IDs, and WebSocket subscription; held in every attack vector tested (`tests/e2e/05-tenant-isolation.spec.ts`, `11-realtime-security.spec.ts`). One open item from the audit: `/api/v1/analytics/overview` has no explicit role check beyond a valid session (tenant-scoping is still correct — the gap is role, not tenant, isolation) — flagged as NOT VERIFIED either way, not confirmed vulnerable.

---

## Section 10 — Integration Architecture

```
External Platform
        ↓
Integration Adapter        (client-specific: verifyWebhookSignature, normalizeInbound, sendOutbound)
        ↓
Normalized GCO Message Model   (Message, Conversation — client-agnostic)
        ↓
GCO Core Pipeline              (queue, assignment, SLA, AI, human review — NEVER touches raw client payloads)
        ↓
Normalized Outbound Model
        ↓
Integration Adapter
        ↓
External Platform
```

**Architectural principle already true today, confirmed by the audit**: the core pipeline (`lib/messages/ingest.ts`, `lib/assignment/engine.ts`, `lib/ai/service.ts`, `lib/messages/send.ts`) only ever calls `adapter.normalizeInbound()`/`adapter.sendOutbound()` — grep-confirmed zero references to a client-specific payload shape anywhere in core code. Adding a real client requires writing one new adapter file, not touching the pipeline.

| Piece | Status |
|---|---|
| Inbound adapter (interface + one implementation) | VERIFIED (interface), dev-mock only (implementation) |
| Outbound adapter | Same |
| Authentication (webhook signature) | VERIFIED for dev-mock's HMAC scheme; unknown for any real client until their spec arrives |
| Webhook handling | VERIFIED — generic, adapter-agnostic |
| Idempotency | VERIFIED — generic, at the queue-job and DB-constraint level, not adapter-specific |
| Retries | VERIFIED — generic, BullMQ-level |
| Error handling | PARTIAL — generic classification exists; adapter-specific error-code mapping cannot exist without a real client |
| Rate limiting | VERIFIED — per-integration, generic |
| Delivery status | PARTIAL — mechanism exists, real signal blocked without a real adapter |
| Media handling | MISSING — confirmed zero support anywhere in the schema or adapter interface |
| Versioning | MISSING — no adapter/API versioning scheme exists (single `adapterKey` string, no version field) |

---

## Section 11 — AI Layer

**Architecture** (VERIFIED, real code): `lib/ai/types.ts` interface, `lib/ai/provider.ts` swap point, tenant/conversation context builder (`buildConversationContext` — trimmed window, not the whole DB), structured output (Zod-validated: suggested_reply, confidence, flags, requires_review), fallback (failed generation never blocks manual send), timeout (`AbortController`-based).

**Mock testing** (VERIFIED): the entire pipeline — suggestion generation, memory extraction, fallback-on-failure — is exercised and passing against the deterministic mock provider.

**Live provider validation**: **BLOCKED BY CREDENTIAL.** `OPENAI_API_KEY` is confirmed empty. No claim of real OpenAI functionality is made anywhere in this document or the underlying audit. Retries at the AI-call level (distinct from queue-level retries) are NOT PRESENT. Cost tracking is NOT PRESENT. Token tracking has a field but is unpopulated (blocked by the same credential gap).

**V1 decision**: ship V1 and the first pilot on the mock provider unless a credential is obtained beforehand. The abstraction is real enough that switching providers is a config change (`AI_PROVIDER=openai` + a key), not an engineering project — but the live behavior, cost, and reliability of that switch have never been observed.

---

## Section 12 — Message Processing

Lifecycle exactly as verified in the audit: ingestion (webhook, persist-before-enqueue) → validation (Zod + HMAC) → persistence (idempotent, unique-constraint-backed) → deduplication (three independent unique constraints: `WebhookEvent`, `Message`, `UsageRecord`) → queue (BullMQ, 6 queues) → assignment (transactional conditional update) → SLA (server-computed deadline) → processing (AI suggestion, async, non-blocking) → outbound response (single enforced send path) → delivery status (tracked, mock-verified only) → audit trail (`MessageEvent` append-only + `AuditLog`) → usage accounting (idempotent ledger).

**Duplicates**: handled by unique constraints at the database level, not application-level checks alone — this is why the audit could confirm "no duplicate message/usage record" held even under the one E2E run that showed a flaky *response status code* (§16 of the audit) — the underlying data guarantee never broke, only the HTTP status returned to a very-fast duplicate delivery was inconsistent once.

**Retries**: BullMQ, 5 attempts, exponential backoff, uniform across all 6 queues.

**Failures**: AI failure recorded, never blocks manual send. Outbound failure retries then dead-letters (verified end-to-end with a real forced failure and recovery).

**Race conditions**: the one class of race the audit's fresh testing actually surfaced (not merely theorized) is a timing window between "Message persisted" and "WebhookEvent.processed flag set," which can cause a near-simultaneous duplicate delivery to receive a `202 requeued` response instead of a `200 deduplicated` response — the data itself never duplicates either way (the requeue is a safe no-op via deterministic job IDs), but the HTTP contract is not currently 100% deterministic under that specific timing. This is named explicitly rather than smoothed over, per the audit's evidence.

---

## Section 13 — Operator Work / Message Accounting

**USAGE ACCOUNTING** (VERIFIED, separate from compensation): messages received, message-to-usage-record mapping (1:1, idempotent), tenant usage (date-range filterable), daily/monthly/yearly usage (achievable via arbitrary date ranges on the existing endpoint, no dedicated report view).

**Messages assigned/handled/responded to**: tracked implicitly via `Assignment.status` and timestamps (`assignedAt`, `respondedAt`) — queryable, not exposed as a named metric anywhere in the UI or a dedicated API field.

**Operator activity**: PARTIAL — operator status (available/busy/offline) is tracked; a rollup of "messages this operator handled today" is not computed anywhere (`OperatorMetricSnapshot` exists in the schema for exactly this purpose and is confirmed unused).

**OPERATOR COMPENSATION**: **explicitly does not exist.** The system tracks `operatorCostPerMessageEurCents` at the tenant level for company-side gross-margin math (client price minus operator cost = margin), but this is a cost-accounting figure, not a per-operator payout calculation. There is no operator-level monetary rollup, no payout record, no compensation model anywhere in the schema or code. **This document does not invent one.** If per-operator compensation is part of the actual business requirement, it is new work, not configuration of something that already exists.

---

## Section 14 — SLA / Operations

**SLA timers**: VERIFIED — server-computed deadline (`Assignment.respondsBy`), immune to browser refresh/reconnect by construction.
**Assignment/reassignment**: VERIFIED — automatic on SLA expiry, plus a manual reassignment endpoint for managers/admins.
**Escalation**: MISSING — reassignment happens, but nothing escalates to a manager/admin (e.g. no notification, no priority bump) after repeated SLA breaches on the same conversation.
**Priority**: PARTIAL — a `priority` field exists and orders the periodic sweep, no client-facing or manager-facing priority concept.
**Overdue messages**: VERIFIED as a queryable state (`slaBreachesLast24h` in the manager analytics endpoint); no dedicated "overdue now" list view.
**Operator availability**: VERIFIED — `AVAILABLE`/`BUSY`/`OFFLINE`/`PAUSED`, operator-controlled.
**Queue behavior**: VERIFIED — durable, idempotent, self-healing via a periodic sweep for stuck conversations.

**Minimum V1 improvement**: none required functionally — SLA/assignment/reassignment is the single most thoroughly-verified part of the entire system. Escalation-on-repeated-breach is a reasonable SHOULD HAVE, not a MUST HAVE, for a first controlled engagement where breach volume will be low and human-monitored anyway.

---

## Section 15 — Realtime

VERIFIED architecture, per the audit's freshest and most directly-tested finding this cycle:

- **WebSockets**: standalone process (`workers/realtime-server.ts`), raw `ws` library.
- **Authentication**: a distinct, 30-second-lived "realtime ticket" token type — structurally rejected by the REST API's own verifier (confirmed: mismatched `typ` claim throws), issued via a dedicated authenticated endpoint that reads the browser's httpOnly session cookie server-side.
- **Tenant isolation**: attacked directly with two live tenants and two live sockets — held.
- **Ticket/session authorization**: missing, garbage, expired, and wrong-token-type tickets all rejected with WS close code 4001 — verified across 4 fresh test runs.
- **Reconnect behavior**: exponential backoff implemented in the browser hook (`lib/realtime/useRealtime.ts`).
- **Polling fallback**: unconditional — confirmed by code inspection that the polling `setInterval` is never removed when a realtime connection succeeds.
- **DB as authoritative state**: architecturally enforced — every realtime message is a content-free "something changed, refetch" signal, never trusted data on its own. This means duplicate or missed realtime events are harmless by construction.

**V1 decision**: realtime is a genuine strength, already solid, and ready to use as-is. Not a blocker either way — polling alone would still make V1 functional if realtime were disabled entirely.

---

## Section 16 — Analytics & KPIs

**CURRENTLY AVAILABLE** (VERIFIED): messages received (implicit via message count), operator workload (active assignments / capacity), queue size, active conversations, SLA breach count, average response time, usage (message count + spend, tenant-scoped), delivery status per message (mechanism, mock-verified).

**REQUIRED FOR V1**: nothing beyond what's already available. The existing stat-card-style dashboards answer the operationally important questions ("is anyone overloaded," "are we breaching SLA," "how much traffic came through") without needing a chart.

**FUTURE ANALYTICS** (explicitly deferred, not required): per-operator historical trend, AI suggestion acceptance/edit-rate reporting, time-series traffic graphs, consolidated pilot-specific KPI report (a manual pull of the existing endpoints is sufficient for a 3-day pilot's scale).

---

## Section 17 — 3-Day Pilot Model (Generic)

Controlled, measurable, limited, reversible — using only what the audit confirms exists today, plus the two named minimum gaps from §18.

### Before pilot
- Create a dedicated `Tenant` (VERIFIED capability).
- Create dedicated users for each role needed — manager, operator(s), client contact (VERIFIED).
- Configure the integration — necessarily `dev-mock` unless a real client spec exists by this point (this document does not assume one).
- Set per-tenant operator capacity/SLA/pricing overrides (VERIFIED, already-configurable `Tenant` fields).
- Send test messages through the configured integration to confirm the pipeline end-to-end before real traffic (this is exactly what the automated E2E suite already does against `dev-mock`).
- Set up monitoring: `/admin/system-health` (VERIFIED) as the operator's dashboard for the pilot's duration.
- Define a rollback/disable procedure: **currently a gap** — `Tenant.status = SUSPENDED` exists but nothing enforces it (§18). The interim, honest procedure until that's built: disable the `Integration` record's `status` field (which IS enforced — the webhook route already rejects non-`ACTIVE` integrations, verified) to stop inbound traffic immediately, and manually deactivate user accounts if access must be cut off.

### Day 1 — Controlled traffic
Monitor via `/admin/system-health` (queue depth, error rate) and `/api/v1/analytics/overview` (SLA breaches, response time, operator load) — both VERIFIED and live-queryable throughout.

### Day 2 — Review and stabilize
Pull usage/analytics endpoints, review any `SystemEvent`/dead-letter entries, address anything found via the existing recovery mechanism (VERIFIED: dead-letter requeue with audit trail).

### Day 3 — Measure and validate
Pull final usage figures (`usage/summary`), SLA compliance (`analytics/overview.slaBreachesLast24h`, `avgResponseSecondsLast24h`), audit log for a full accounting of sensitive actions taken during the pilot.

### End of pilot — generate
- Operational KPI report: assembled manually from the existing endpoints above (no dedicated report exists — acceptable at pilot scale).
- Issues: pulled from `SystemEvent`/dead-letter/audit log.
- Client feedback: via the existing ticket system (VERIFIED).
- AI quality observations: manual review of `AiGeneration.status` (accepted vs. edited) — the data exists, no automated report does.
- Operator performance: limited to what's queryable (assignment counts, response times) — no per-operator dashboard exists (§13).
- Delivery reliability: `Message.status` distribution, queryable.
- Recommendation: GO TO PAID / EXTEND VALIDATION / STOP — a business decision this document does not make.

---

## Section 18 — Pilot Limit Controls

| Control | Status |
|---|---|
| Duration | MISSING — no scheduled expiry; enforceable only by manual action (deactivating the integration/users) |
| Message volume | MISSING — no cap field or check anywhere |
| Operators | CURRENT — `Operator.capacity`, per-tenant defaults, fully supported |
| Traffic segment | MISSING — no way to separate pilot vs. non-pilot traffic within one tenant (a dedicated tenant achieves this instead, which IS supported) |
| Language | PARTIAL — field exists, no enforcement |
| Operating hours | MISSING — no time-of-day logic anywhere |
| AI usage | CURRENT — feature-flaggable (`FEATURE_AI_SUGGESTIONS`/`FEATURE_AI_MEMORY`, both genuinely wired, confirmed by the audit) |
| Integration scope | CURRENT — one `Integration` per tenant, scoped by `adapterKey` |

**Only specifying, not building.** If duration/volume caps are required for a truly bounded pilot (recommended), the minimum technical additions are: (1) enforcing `Tenant.status`, and (2) a message-volume counter check in the webhook path against a per-tenant cap field. Both are small, targeted additions to already-existing mechanisms, not new subsystems.

---

## Section 19 — Client Onboarding Model (Generic)

| Stage | What GCO needs from the client |
|---|---|
| 1. Commercial qualification | None — business-side |
| 2. Technical discovery | Broad shape of their platform: do they have webhooks, what's their conversation/message model |
| 3. API documentation | Full spec — required before any adapter code can be written |
| 4. Sandbox credentials | Required before adapter-specific testing can begin |
| 5. Data mapping | Real (not just documented) payload examples, ID semantics, timestamp format |
| 6. Integration implementation | Nothing further from the client — GCO builds the adapter against what's already been provided |
| 7. Internal testing | Continued sandbox access |
| 8. Security validation | Their webhook signature method, confirmed working against real signed requests |
| 9. Pilot configuration | Expected traffic volume (to size limits, §18), any operating-hour/language requirements |
| 10. 3-day pilot | Production-adjacent sandbox or limited-production access, depending on their setup |
| 11. KPI review | Their own feedback/acceptance criteria, if any beyond GCO's own metrics |
| 12. Production approval | Sign-off, business-side |
| 13. Paid operation | Production credentials, delivered through a secure channel |

---

## Section 20 — Generic Client Technical Questionnaire

**A. API** — Do you have a documented API? REST/webhook/other? Base URL(s) for sandbox and production?

**B. Authentication** — What authentication method do you require for calls we make to you? What method do you use to sign calls you make to us (if configurable)?

**C. Webhooks** — Do you push events to us, or do we poll you? What's the expected webhook URL format on our side? Do you support a custom signature header?

**D. Inbound messages** — What does an incoming message payload look like (real examples, not just a schema)? What's guaranteed to be present vs. optional?

**E. Outbound messages** — What API do we call to send a reply? Synchronous response or async confirmation?

**F. Conversations** — Do you have a stable conversation/thread identifier? How is a new conversation distinguished from a continuing one?

**G. Attachments/media** — Can messages include images, files, or other media? In what format (URL, base64, separate upload endpoint)? (GCO currently has no media support — this determines whether that's needed.)

**H. Rate limits** — What limits do you impose on calls to you? Should we advise you of limits on our side?

**I. Error/retry behavior** — What error codes do you return and what do they mean? Do you retry failed webhook deliveries to us, and with what backoff?

**J. Delivery status** — How do we learn whether an outbound message was actually delivered — synchronous response, async webhook, polling?

**K. User/operator requirements** — Do you need visibility into which of our operators handled a conversation? Any operator-side requirements?

**L. Languages** — What languages does your platform operate in? Any per-conversation language signal we should expect?

**M. Business rules** — Any conversation routing or handling rules specific to your platform we should know about?

**N. Operating hours** — Does your traffic need to be handled within specific hours, or is it 24/7?

**O. Escalation** — Do you need an escalation path for unanswered or problematic conversations beyond our standard SLA/reassignment?

**P. Expected traffic** — Approximate message volume (peak and average) so we can validate against our measured capacity.

**Q. Security** — Any specific security or compliance requirements (data handling, encryption, access controls) beyond standard practice?

**R. Data retention** — Do you have requirements for how long we retain conversation data?

**S. Compliance** — Any regulatory framework we need to account for (region-specific or industry-specific)?

**T. Reporting/KPIs** — What reporting do you expect to see, and at what frequency?

**U. Sandbox/testing** — Can you provide a sandbox environment before production access?

**V. Production credentials** — What's the secure channel for exchanging production credentials once we're ready?

---

## Section 21 — Production Architecture

| Component | Status |
|---|---|
| Application (Next.js) | CURRENTLY IMPLEMENTED, direct-process deployment VERIFIED |
| Worker (BullMQ) | CURRENTLY IMPLEMENTED, VERIFIED |
| Realtime (WebSocket) | CURRENTLY IMPLEMENTED, VERIFIED |
| PostgreSQL | CURRENTLY IMPLEMENTED, VERIFIED (source of truth, no RLS — application-layer isolation only, a documented tradeoff) |
| Redis | CURRENTLY IMPLEMENTED, VERIFIED (queue + rate limit + pub/sub, one instance for all three roles) |
| Queues | CURRENTLY IMPLEMENTED, VERIFIED |
| Secrets | CURRENTLY IMPLEMENTED (env vars), NEEDS VERIFICATION in a real secrets-manager context (currently `.env` files only) |
| Deployment (Docker) | NEEDS VERIFICATION — never built or run anywhere |
| Migrations | CURRENTLY IMPLEMENTED, VERIFIED (`prisma migrate status` clean, `prisma validate` clean) |
| Health checks | CURRENTLY IMPLEMENTED, VERIFIED |
| Logging | CURRENTLY IMPLEMENTED, VERIFIED (structured JSON, no correlation IDs) |
| Monitoring | PARTIAL — pull-based dashboard exists, no push-based alerting |
| Alerting | REQUIRED FOR PRODUCTION, currently MISSING |
| Backups | DOCUMENTED, NEEDS VERIFICATION (procedure written, never drilled) |
| Restore | Same |
| Rollback | PARTIAL — forward-only migrations plus tagged container images is the documented strategy; never exercised for real |

**V1 decision**: direct-process deployment (already proven — this is what runs every dev/test session) is sufficient for a controlled pilot and even an early production client, provided the hosting environment is reliable. Docker verification and real alerting are REQUIRED FOR PRODUCTION at meaningful scale, not blockers for a first controlled engagement.

---

## Section 22 — Security Baseline

All items below reference actual test evidence from the audit, not assertion:

- **Authentication**: VERIFIED — custom JWT, bcrypt, `tests/e2e/07-session-security.spec.ts` (6 tests).
- **RBAC**: VERIFIED — `tests/e2e/06-rbac.spec.ts` (6 tests, all 5 roles).
- **Tenant isolation**: VERIFIED — `tests/e2e/05-tenant-isolation.spec.ts` (6 tests, multiple attack vectors).
- **WebSocket isolation**: VERIFIED — `tests/e2e/11-realtime-security.spec.ts` (6 tests, including live two-tenant cross-isolation).
- **IDOR prevention**: VERIFIED — guessed-ID attacks held.
- **Webhook verification**: VERIFIED — HMAC, timing-safe, forged-signature rejection tested.
- **Rate limiting**: PARTIAL — 3 of 23 routes covered; this is the single most concrete security gap identified against a V1 launch.
- **Secret handling**: VERIFIED — no secrets in git history, `.dockerignore` excludes `.env*`, confirmed by the audit this session.
- **Cookie/session security**: VERIFIED — `httpOnly`, `SameSite=strict`, logout genuinely revokes (previously a real bug, fixed and regression-tested).
- **Validation**: VERIFIED — Zod on every route, malformed JSON/validation errors correctly classified as 400.
- **Error-message protection**: VERIFIED — previously leaked raw exception text on 500s, fixed and regression-tested; generic message to client, full detail server-side only.
- **Audit logging**: VERIFIED — every sensitive action recorded.
- **Least privilege**: VERIFIED via the RBAC matrix's narrow scoping per role.

**V1 requirement**: extend rate-limit coverage before opening admin/tenant-management routes to anyone beyond the founding team's own trusted accounts.

---

## Section 23 — Reliability Baseline

| Item | Status |
|---|---|
| Retries | VERIFIED |
| Idempotency | VERIFIED (4 distinct DB unique constraints back the core guarantees) |
| Queue recovery | VERIFIED |
| Dead-letter handling | VERIFIED — real forced failure, real recovery, audited |
| Concurrency (assignment) | VERIFIED |
| Worker recovery (crash) | NOT VERIFIED — architecturally sound (BullMQ ack-after-complete), never fault-injection tested |
| API failures | NOT VERIFIED |
| Redis failures | NOT VERIFIED |
| Database failures | NOT VERIFIED |
| External integration failures | PARTIAL — verified for AI (mock), not verified for any real outbound client (no real adapter exists to fail against) |
| Graceful degradation | VERIFIED for AI-down (never blocks manual send) and realtime-down (polling continues) |
| Monitoring | PARTIAL — pull-based only |

**V1 requirement**: none of the NOT VERIFIED items are functional gaps in the code — they are testing gaps. For a first controlled pilot at modest scale, this is an acceptable risk profile provided someone is actively watching `/admin/system-health` during the pilot window. For sustained production operation, these should move to VERIFIED before scale increases meaningfully.

---

## Section 24 — V1 Scope

**MUST HAVE** (small, each with a reason):
1. **Core message pipeline as-is** — already VERIFIED, this is the product itself.
2. **Tenant isolation as-is** — already VERIFIED; a security failure here is unacceptable at any scale, so "keep it working" is a MUST HAVE even though no new work is required.
3. **RBAC as-is** — same reasoning.
4. **`Tenant.status` enforcement** — currently inert; without it, there is no clean way to stop a tenant's traffic short of disabling their `Integration` record, which works but is a workaround, not a designed control. Needed for any pilot or client relationship that might need to pause.
5. **Rate-limit coverage extended to client/admin-facing routes beyond the current 3** — needed before any credential beyond the founding team's is used against the system.
6. **The real client's `IntegrationAdapter`, once a spec exists** — the product cannot onboard a client without it; everything else in this list can ship without it.

**SHOULD HAVE** (valuable, not blocking):
- Message-volume cap for pilot control.
- Minimal admin-panel UI for user creation and audit-log viewing (API already works).
- Real error tracking (Sentry or equivalent) — valuable operationally, not a functional gap.
- Escalation-on-repeated-SLA-breach.
- Docker build/deployment verification.

**DEFERRED** (explicitly, with reasons):
- Operator performance metrics / per-operator historical trend — no client requirement has surfaced one; the schema is ready when needed.
- Operator compensation calculation — not confirmed to be part of the near-term business model; would need explicit confirmation before building.
- Charts/graphs — the existing numeric dashboards answer the operational questions that matter today.
- Media/attachment handling — unknown need until a real client spec exists; would be substantial new work (schema + adapter interface + storage), not a small addition.
- Operating-hours/language enforcement — same reasoning, defer until a real requirement is confirmed.
- AI memory correction UI — extraction works; correction has no demonstrated need yet.
- CI pipeline execution / Docker verification for anything beyond a first controlled pilot — direct-process deployment is already proven sufficient at pilot scale.

---

## Section 25 — V1 Non-Goals

GCO V1 is explicitly NOT trying to solve:
- Every possible client integration — one real adapter at a time, built against real specs, not a generic "works with anything" framework.
- Advanced BI/analytics — the existing stat-card dashboards are sufficient; no data warehouse, no charting library, no time-series analytics.
- A complex compensation system — usage accounting exists; operator payout does not, and building one without a confirmed business requirement would be speculative.
- Unlimited/autonomous AI — the AI never sends without human review, by structural design, and this document does not propose changing that.
- Every messaging channel or media type — text-only for now; media support is deferred until a real need is confirmed.
- Highly customized per-client workflows — the integration-adapter boundary exists specifically so client-specific logic stays out of the core; V1 does not add per-client business-rule engines.
- Enterprise-scale features not yet justified by real usage — multi-region deployment, RLS, dedicated infrastructure per tenant, and similar are not V1 concerns at current scale.

---

## Section 26 — Delivery Phases

**PHASE 0 — Current Baseline**
Objective: establish the factual starting point (already done — `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md`).
Inputs: the existing codebase.
Deliverables: the audit document.
Acceptance criteria: fresh test execution recorded, no claims unverified.
Dependencies: none.
Risks: none — this phase is complete.

**PHASE 1 — GCO V1 Hardening**
Objective: close the §24 MUST HAVE gaps that don't depend on a client spec.
Inputs: this document's §24.
Deliverables: enforced `Tenant.status`, extended rate-limit coverage, (optionally) message-volume cap.
Acceptance criteria: each item independently tested; full regression suite still passing.
Dependencies: none external.
Risks: low — these are small, targeted additions to existing mechanisms, not new subsystems.

**PHASE 2 — Generic Client Onboarding Foundation**
Objective: ensure the onboarding process (§19) and questionnaire (§20) are ready to use the moment a prospect is qualified.
Inputs: §19/§20 of this document.
Deliverables: none code-side — this phase is process readiness, already satisfied by this document existing.
Acceptance criteria: questionnaire is generic (confirmed — no client named anywhere in this document).
Dependencies: none.
Risks: none.

**PHASE 3 — Client-Specific Integration**
Objective: build the real `IntegrationAdapter` for whichever client is first confirmed.
Inputs: their completed questionnaire (§20), sandbox access.
Deliverables: `lib/integrations/adapters/<client-key>.ts`, adapter-specific tests.
Acceptance criteria: adapter passes contract tests against their sandbox; existing E2E suite still passes unmodified (proving the core pipeline needed no changes).
Dependencies: **BLOCKED until a client's spec and sandbox access exist.**
Risks: unknown client-side platform behavior; the questionnaire minimizes but cannot eliminate this.

**PHASE 4 — Pilot**
Objective: run the 3-day controlled pilot (§17) with the real client's adapter.
Inputs: Phase 3's completed adapter, Phase 1's hardening.
Deliverables: the end-of-pilot KPI report described in §17.
Acceptance criteria: no data loss, no cross-tenant leakage, SLA/usage figures reconcile.
Dependencies: Phase 3 complete.
Risks: first real exposure of the adapter to real traffic — exactly what a pilot is for.

**PHASE 5 — Production**
Objective: move from pilot to standing paid operation.
Inputs: pilot's GO decision.
Deliverables: production credentials exchanged, monitoring/alerting in place (§21 gaps closed as needed for the client's actual scale).
Acceptance criteria: §27's acceptance criteria all met.
Dependencies: Phase 4's GO outcome.
Risks: the untested reliability items in §23 (worker crash, DB/Redis outage) become materially more important at sustained production scale than at pilot scale.

**PHASE 6 — Scale**
Objective: expand beyond the first client, revisit deferred items (§25) as real usage justifies them.
Inputs: production operation data.
Deliverables: whatever the second/third client's actual requirements demonstrate as necessary — not speculated here.
Acceptance criteria: N/A — out of scope for this document.
Dependencies: Phase 5 sustained successfully.
Risks: out of scope.

---

## Section 27 — Acceptance Criteria (V1)

Each is measurable against something already built or explicitly named as needed:

1. Tenant isolation: `tests/e2e/05-tenant-isolation.spec.ts` and `11-realtime-security.spec.ts` pass — **already true**.
2. RBAC: `tests/e2e/06-rbac.spec.ts` passes — **already true**.
3. Inbound message successfully processed: `tests/e2e/01-message-lifecycle.spec.ts` passes — **already true**.
4. Assignment works: `tests/e2e/03-operator-capacity.spec.ts` passes — **already true** (with the one noted flaky-run caveat to be resolved before treating CI as a hard gate).
5. SLA works: `tests/e2e/04-sla-timeout.spec.ts` passes — **already true**.
6. Operator can respond: covered by #3.
7. Outbound delivery works: covered by #3, dev-mock only until a real adapter exists.
8. Usage is recorded: `tests/e2e/10-usage-ledger-business-model.spec.ts` passes — **already true**.
9. Realtime works: `tests/e2e/11-realtime-security.spec.ts` passes — **already true**.
10. Failures are visible: dead-letter + audit log + system-health endpoint all populated correctly — **already true**.
11. AI works when provider credentials are available: **cannot be marked complete until a key exists and the pipeline is re-run against it** — currently BLOCKED, not failing.
12. External integration passes contract tests: **cannot exist until a real client spec exists** — BLOCKED, this document does not fabricate a target.
13. Production deployment is verified: **not yet met** — Docker has never been built or run; direct-process deployment is verified as an interim path.

---

## Section 28 — Current Risks

**CRITICAL**: none, beyond the already-named external blockers (no client spec, no AI credential, no Docker environment) — none of these are code defects.

**HIGH**:
1. Demonstrated E2E test flakiness under system load (2 of 4 fresh full-suite runs this audit cycle had one intermittent failure each) — should be understood and stabilized before treating CI green/red as an unconditional gate.
2. Rate-limit coverage gap (20 of 23 routes) — relevant the moment credentials beyond the founding team are in use.
3. `Tenant.status` unenforced — no clean way to stop a tenant's traffic today.

**MEDIUM**:
1. No operator-compensation logic, if that turns out to be part of the real business model.
2. No message-volume cap — relevant to running a genuinely bounded pilot.
3. Untested infrastructure-outage recovery (worker crash, DB/Redis down) — architecturally sound, unproven.

**LOW**:
1. No real error tracking despite being implied in `.env.example`.
2. Schema-only tables (`OperatorMetricSnapshot`, `Notification`) — maintenance-confusion risk, not a functional one.
3. Unused npm dependencies, empty scaffolding directories — cosmetic.

---

## Section 29 — Final GCO V1 Product Definition

**GCO V1 is** a working, independently-tested multi-tenant platform that takes incoming conversational traffic from a client's system, durably queues it, safely assigns it to an available human operator under an enforced response-time budget, offers that operator an AI-drafted reply they can accept, edit, or ignore, sends only what the human actually approves, tracks delivery, and bills every message exactly once against a precise per-message price — all while keeping every client's data, dashboards, and realtime updates completely separate from every other client's, a guarantee that has been directly and repeatedly attacked in testing rather than merely assumed.

It is built as a single, honestly-scoped application: one Next.js app, one background worker, one realtime process, PostgreSQL as the single source of truth, Redis as the shared queue/cache/pub-sub layer — no unnecessary services, no premature microservices, no framework the team doesn't need. Seventy-one automated tests, re-run fresh as part of the audit behind this document, prove the core loop works — not once, but repeatably, under real HTTP requests against a real database and a real WebSocket connection, not mocks standing in for the system itself.

What V1 is not, yet: connected to any real client (that requires a real specification, which does not exist today, and this document refuses to invent one); validated against a real AI provider (that requires a credential that isn't present); or verified in a containerized or genuinely production-hosted environment (Docker has never been run anywhere this code has lived). None of these are defects in what's been built — they are the honest, named boundary of what "verified" currently means, and closing them is external work (a client conversation, a credential, an infrastructure decision), not further engineering on the core product.

For a founder: the product works, the hard safety guarantees (tenant isolation, human-approval-only sending, exact billing) are proven, and the path to a real client runs through getting their API spec — not through more building. For a technical lead: the architecture is sound, boring in the best sense, and the gaps are itemized and small. For an operator manager: the day-to-day tools (assignment, SLA, AI assist, send) already work end to end. For a prospective client: GCO can demonstrably queue, assign, AI-assist, and account for messages safely today — connecting it to their specific platform is the next, well-defined step, not a leap of faith.

---

## Section 30 — Final Decision Matrix

| Area | Current State | V1 Requirement | Status | Priority |
|---|---|---|---|---|
| Core messaging | Full pipeline VERIFIED | Keep as-is | MET | — |
| Integrations | `dev-mock` only, abstraction VERIFIED | Real adapter when spec exists | BLOCKED | High (once unblocked) |
| Operators | Full workflow VERIFIED | Keep as-is | MET | — |
| Managers | Basic ops visibility VERIFIED | Keep as-is | MET | — |
| Admin | Core actions VERIFIED via API | Minimal UI wrapper | PARTIAL | Should have |
| Clients | Usage + tickets VERIFIED | Keep as-is | MET | — |
| AI | Mock VERIFIED, real BLOCKED | Mock acceptable for V1 | PARTIAL | Medium (High once a key exists) |
| Realtime | VERIFIED | Keep as-is | MET | — |
| Usage | VERIFIED, exact business-model match | Keep as-is | MET | — |
| Analytics | Basic counts VERIFIED, depth MISSING | Basic counts sufficient | MET | — |
| Security | RBAC/tenant isolation VERIFIED, rate-limit PARTIAL | Extend rate-limit coverage | PARTIAL | High |
| Reliability | Core guarantees VERIFIED, outage handling NOT VERIFIED | Acceptable for pilot scale | PARTIAL | Medium |
| Deployment | Direct-process VERIFIED, Docker NOT VERIFIED | Direct-process sufficient for V1 | PARTIAL | Should have |
| Monitoring | Pull-based VERIFIED, alerting MISSING | Pull-based acceptable for V1 | PARTIAL | Should have |
| Pilot controls | Tenant/operator/RBAC READY, volume/duration/hours MISSING | Enforce `Tenant.status`, add volume cap | PARTIAL | Must have (for a bounded pilot) |
| Onboarding | Process defined this document, zero clients onboarded | Ready to execute | MET (process), BLOCKED (execution) | High (once a client exists) |
