# 53 — Two commercial models, AI-assisted drafting, billing measurement, emergency coverage (8 Nov 2026)

Answers to the CEO's two messages of 8 Nov. Everything here was checked in the code on the release branch (`9d305d5`) or run locally on 8 Nov with fictional data. Nothing was changed in production, nothing bought.

## 1. Can the platform support both commercial models?
| | Option A: operators work in the client's tool (Zendesk, Intercom, Gorgias…) | Option B: client connects to the GCO Workspace |
|---|---|---|
| Works today | Shifts and attendance, absences, handovers, training and qualifications, QA reviews (logged by hand), operator earnings, **hourly invoicing from scheduled shift hours** | Queues, assignment, response timers, reassignment, supervision, escalation, QA, delivery status, tenant isolation, usage ledger, CSV exports, **per-message invoicing** |
| Missing | **Hourly rate plus tickets above an included volume** (no "included volume + overage" billing model); ticket counts from the client's tool (no import; would be entered or uploaded per period) | **Per-ticket invoicing counts the wrong thing** (below); **moderation is not invoiced** at all; connectors for Zendesk, Intercom, Gorgias; AI drafting is off |
| Effort to close the gap | Small to medium: a hybrid billing model and a CSV/manual import of the client's ticket counts | Small: correct the ticket count and add moderation billing. Medium per connector |

**Billing defect found (Option B, per ticket):** the `PER_TICKET` invoice counts rows of the internal `Ticket` table, which holds the client's *requests to GCO* (support issues raised in the client panel), **not** customer conversations. A client billed per ticket today would be billed for their own service requests. The right source exists: conversations have a **resolved** state with a close time (and can be reopened, which clears it). Fix: count conversations resolved in the period, excluding reopened ones, under an agreed "eligible ticket" definition (for example: at least one operator reply, not spam or a duplicate). Not changed yet; it is a billing change for approval.

**Moderation billing:** every moderation item records its decision and time, so moderated messages are countable; the invoice does not use them yet. Adding a "per moderated item" line is small.

## 2. Can we measure billing units and productivity accurately?
| Measure | Source | Accurate today? |
|---|---|---|
| Handled messages | Usage ledger (one row per message, idempotent, price frozen at the time) | Yes |
| Completed tickets (Option B) | Resolved conversations with close time | **Data yes; invoice no** (defect above) |
| Moderated messages | Moderation items with decision time | **Data yes; invoice no** |
| Operator hours | Scheduled shifts net of absences | Yes for scheduled hours; actual online time is not invoiced |
| Response time per reply | Assignment time to reply time | Yes |
| Operator productivity | Messages handled, average response, SLA breaches per operator; QA scores | Yes |
| Tickets in the client's tool (Option A) | The client's own reports | Not in GCO; agreed in the contract, imported per period |

## 3. AI-assisted drafting: what prevents reactivation
**What already exists and works:** AI prepares a draft; the operator edits and sends; **AI can never send** (the only send path is the operator's). Per-client switch (`HUMAN_ONLY` produces no AI call at all). Master switch (exact value `enabled` only) plus a **separate approval flag for any external provider**, so a test stack cannot call out by accident. Provider failures never block operators. Context is tenant-scoped (last 12 messages of that conversation only). Each draft records model, tokens used, latency, and whether the operator **accepted it unchanged, edited it or ignored it**. Logs carry no message content.

**Tested 8 Nov (local, fictional data, mock AI, no external call, no cost):** with the switch enabled, the two AI end-to-end tests **pass (3 of 3)**: the full message lifecycle with an AI draft, operator edit, send and delivery; and memory extraction with traceability and no invented facts. The full suite with AI on: see §6.

**Missing before a real provider is used (technical):**
1. **Spend cap and alert:** none in the code. Minimum: a monthly budget limit on the OpenAI project (set in OpenAI's console) plus a per-client daily call cap in GCO.
2. **Redaction:** messages are sent as written (up to 4,000 characters). Decide per client whether emails, phone numbers and order numbers are masked before sending.
3. **Client knowledge is not used:** the prompt has slots for client and service instructions, but they are never filled, so drafts ignore the client's knowledge base and policies. Small change; it matters most for quality.
4. **A productivity report** (draft accepted / edited / ignored rates and response time with and without drafts). The data exists; the report does not.
5. **Evaluation with the real model on synthetic conversations** (quality, wrong-language and refusal cases, latency). Needs an OpenAI account and key: a paid service, so the CEO's approval.

**Missing (security, privacy, legal):** OpenAI's data processing terms accepted and OpenAI listed as a sub-processor; each client's written agreement that their conversations may be sent to the AI provider (the per-client switch enforces it technically); privacy notice and transfer assessment (OpenAI is a US company; European data residency for API projects is offered by OpenAI and should be checked for our account); API data is not used for training by default, but is kept by OpenAI for abuse monitoring unless zero retention is granted, which should be requested; lawyer review together with the DPA.

**Can we enable it on staging with synthetic data without touching production?** Yes. Two steps: (a) **mock AI** on staging, free, no external call: already shown locally today; (b) **real model** on staging with synthetic conversations only, an OpenAI project with a hard budget (suggest €10/month) and the key stored only on staging. Production stays `disabled` until the items above are done and approved.

## 4. Expected AI cost
Per inbound customer message the platform makes **two calls** (draft reply, and memory extraction). Default model `gpt-4o-mini`: **$0.15 per million input tokens, $0.60 per million output tokens** (OpenAI's pricing page, 8 Nov 2026).
| Case | Tokens per message (both calls) | Cost per message | Per ticket (4 customer messages) |
|---|---|---|---|
| Typical support message (~250 characters, short history) | about 2,000 in, 350 out | about **$0.0005** | about **$0.002–0.003** (well under 1 cent) |
| Worst case (12 long messages of 4,000 characters in context) | about 24,000 in, 1,000 out | about $0.004 | about $0.03 |
| Moderation | AI is not used in moderation | — | — |
These are estimates from the code's own limits (12 messages of context, 400 output tokens per draft, 600 per extraction), not measured. The staging evaluation (§3, step b) records the real token use per draft. A larger model would cost 2 to 8 times more. Against a €3–4 ticket price, AI cost is negligible; the real question is quality and time saved.

**Measuring time saved:** run the same client (or two comparable ones) with drafts on and off for two weeks (`AI_ASSISTED` vs `HUMAN_ONLY`); compare median time from assignment to reply, replies per operator hour, and the share of drafts accepted unchanged or edited. All data is already recorded; only the report needs building (§3 item 4).

## 5. Integrations needed for the GCO Workspace (Option B)
| Integration | Status |
|---|---|
| Generic signed webhook (client sends messages, GCO calls back with replies, both signed) | **Built and tested** (client builds to our contract; integration guide written) |
| Moderation intake (items pushed for review) | Built |
| Zendesk, Intercom, Gorgias connectors (tickets in and replies out through their APIs and webhooks, no client development) | **Not built.** Each needs the platform's API documentation, a sandbox account and a few days to two weeks; build the first only when a signed client needs it |
| Email channel | Not built |

## 6. Test runs on 8 Nov (local, fictional data)
- AI specs with mock AI enabled: 3 of 3 passed.
- Full end-to-end suite with mock AI enabled (`AI_MASTER_SWITCH=enabled`, `AI_PROVIDER=mock`, no external approval flag): **305 passed, 5 skipped, 1 failed**. The failure is spec `01b` (AI-off lifecycle), which asserts that no draft exists and therefore fails by design with AI on. With AI off (5 Nov): 307 passed, 2 skipped, 2 failed (the two AI specs). Together the two runs cover both modes.

## 7. Emergency coverage and operator replacement procedure (draft for approval)
**Before each shift week**
1. Every shift has a **named primary operator and a named backup** (qualified for the client, same language, not scheduled in an overlapping shift). For 24/7 projects at least two backups per day.
2. The supervisor confirms the plan by Friday for the next week; operators confirm their shifts in the platform.

**Notice rules**
3. An operator who cannot work tells the supervisor **at least 12 hours before** the shift (emergencies: as soon as possible, by phone or the agreed chat) and records the absence in the platform.
4. The platform then shows a **coverage gap**; the supervisor contacts the backup first, then the other qualified operators, and records the replacement shift.

**During a shift**
5. If an operator goes offline unexpectedly for **more than 10 minutes** ("on shift but offline" alert), the supervisor transfers their held conversations to another operator with a handover note and calls the backup.
6. If no replacement is available within **30 minutes**, the supervisor (or the CEO when no supervisor is on duty) informs the client contact, states the expected recovery time, and the queue is handled by the remaining operators in priority order.

**After**
7. Every gap is logged (date, cause, minutes uncovered, client informed yes/no) and reviewed weekly; repeated no-shows lead to removal from the project.
8. Payment rules for backup and short-notice shifts are part of the operator agreement (legal review).

**Platform support:** absences, coverage gaps, offline alerts, transfer and handovers exist today. Approved improvement: every shift shown with its time zone and each operator's local time (to build). Proposed next: a "who can cover?" list for a gap.

## 8. Built on 9 Nov 2026 (release branch, local, not deployed, not committed)
| Item | What changed |
|---|---|
| Per-ticket billing defect | A completed eligible ticket = a conversation **first** resolved in the period with at least one operator reply (`Conversation.firstClosedAt`, set once and never cleared by a reopen; backfilled from `closedAt`). The internal `Ticket` table (client requests to GCO) is no longer billed. The integration test that asserted the old behaviour was changed accordingly. |
| Option A billing | New model `HOURLY_PLUS_TICKETS`: scheduled hours × hourly price, plus tickets above `includedTicketsPerPeriod` × price per ticket. Ticket counts from the client's own tool are recorded per period (`ExternalTicketCount`, CEO only, audited, locked while an invoice covers the period). |
| Moderation billing | `pricePerModeratedItemEurCents`: a "Moderated items" line (items decided in the period) under any model. |
| Productivity and time saved | `GET /api/v1/reports/productivity` and a manager-dashboard panel: replies, median reply time with and without an AI draft, completed tickets, moderated items, scheduled hours, replies per hour; draft use (unchanged, edited, not used, failed). The time-saved figure appears only with at least 20 replies in each group. Supervisors see their team only. |
| Shift time zones | `Operator.timezone`, `PATCH /api/v1/operators/[id]/timezone` (planners of the same client, audited); planner and operator schedule show the client zone and the operator's local time. |
| Website wording | Applied per `52` and the CEO's decisions of 5 and 8 Nov; not published. |

| AI safeguards (built 9 Nov with the CTO's explicit go-ahead for `lib/ai`) | **Daily call cap per client** (`Tenant.aiDailyCallLimit`, default 2,000 provider calls per UTC day; drafts and memory extraction both count; fails closed if the counter is unavailable; first refusal of the day writes one system event). **Client knowledge in drafts**: the client's INSTRUCTION entries (any language or the conversation's, not archived, newest first, at most 3,000 characters). **Masking** (`Tenant.aiMaskPersonalData`, default on): emails, phone numbers, IBANs and runs of 6+ digits are replaced before any text is sent; names and free-text addresses are not detected. All three set per client in Service settings (CEO and assistant), audited. |
| Migrations | Three new additive migrations in total: 16 → **33** on production when released. |

**Tests after the AI safeguards (9 Nov, local, fictional data):** unit 764 of 764; integration 236 of 236; end-to-end with AI off 310 passed, 2 skipped, 2 failed (the two AI specs, by design); end-to-end with the mock AI on 308 passed, 5 skipped, 1 failed (`01b`, the AI-off check, by design). Both AI specs pass with masking and client instructions active. Still required before a real provider: the OpenAI project's own monthly budget, OpenAI's data processing terms, each client's agreement, the transfer assessment and the lawyer's review.
