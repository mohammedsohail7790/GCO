# GCO operational readiness - website to delivery (Phase D)

Audit date: 2026-10-06. Method: traced the real code paths, then verified on the real local stack (Postgres + Redis + web + worker + realtime): unit 217, integration 39, API-level E2E 167, `tsc`, `eslint`, `next build` all clean. No production data was created.

## 1. Executive summary
GCO can safely take a real prospect from the website to a paid, commissioned, operating client. The chain (pilot -> CRM lead -> Hunter -> approval -> Closed Won -> BPO handoff -> first payment -> one 10% commission) is implemented, race-safe and covered by tests. The audit found and fixed **six genuine defects** (section "Fixes"). Remaining gaps are product gaps, not safety gaps (see Known limitations): no scheduled follow-ups/outbound email, client login provisioning is a manual CEO step, QA is review-by-humans rather than a scored programme.

Verdict: **YES WITH CONDITIONS** - run the first pilots with a human in the loop for (a) client user/integration provisioning after handoff and (b) recording month-2+ revenue, both of which are manual by design today.

## 2. End-to-end flow (IMPLEMENTED)
Website `/pilot` -> `POST /api/v1/public/contact` (honeypot, rate limit, size limits) -> Lead (`source=website_pilot_form`, unassigned, stage NEW; repeat email -> history on the same lead) -> Hunter claims (30-day lock) -> pipeline NEW..PROPOSAL -> submit for approval -> Manager/CEO approves -> **Closed Won** (no commission) -> BPO handoff job creates the client Tenant -> Manager/CEO confirms first-month payment -> **one** Commission (10% of the amount collected, PENDING) + RevenueRecord -> CEO moves payout Pending -> Approved -> Paid (or Cancelled) -> operations run in the tenant (queue, assignment, operators, supervisors, escalation).

## 3. Pilot intake - IMPLEMENTED
Required: email, company. Optional: website, service, volume, languages, coverage, message. Honeypot silently accepted without a lead; per-IP rate limit (Cloudflare-aware); body/field size limits; the public response is only `{received:true}` (no lead id). Analytics carry no form content. Repeat submission (any email casing) never creates a second lead, never touches owner/stage/timers, appends a timestamped history entry and a note, and fills only empty safe fields. Tests: E2E 17, 21, 23; integration `crmOperationalChain`.

## 4. CRM / duplicates - IMPLEMENTED (fixed)
Email = hard duplicate, VAT/tax ID = hard duplicate (both DB-unique-backed), domain = soft warning. Leads are GCO's own sales data (no `tenantId`), so "cross-tenant" does not apply to leads; tenant data (conversations, escalations, revenue, commissions) is tenant-scoped. **Fix:** email is now matched case-insensitively and stored lower-case; VAT IDs ignore case/spaces/dots/dashes - previously `Jane@Acme.com` and `jane@acme.com` created two leads.

## 5. Hunter / lead lock - IMPLEMENTED (fixed)
Claim is an atomic conditional update (one winner). Ownership: 30 days, extended by logged activity, auto-released hourly by the worker with an `auto_released` history entry (actor null) and audit log. A Hunter cannot read or change another Hunter's lead (stage, release, activity, submit all refused). Manager/CEO lead visibility (`LEAD_VIEW_TEAM`) is unchanged and intentional. **Fix:** the sweep (and manual release) previously could release a `PENDING_APPROVAL` or `CLOSED_WON` lead after 30 days of inactivity - that strips the owner and makes `confirmFirstPayment` impossible ("Lead has no owner"), silently losing the Hunter's commission. Those stages are now never released (409 on manual release, skipped by the sweep).

## 6. Pipeline / follow-up
Stages (existing, unchanged): NEW, CONTACTED, ENGAGED, QUALIFIED, MEETING_BOOKED, PROPOSAL, PENDING_APPROVAL, CLOSED_WON, CLOSED_LOST. Transitions are validated; CLOSED_WON is unreachable through the Hunter stage API. **Fix:** stage changes are now conditional on the validated starting stage, so a double submit-for-approval created two approvals; now exactly one.
Follow-up - **PARTIAL:** activity logging (extends the lock), a "follow-ups due" list on the Hunter dashboard (leads whose lock expires within 5 days) and history. There is **no** scheduled follow-up model (due dates, reminders, completion) and **no outbound email/outreach provider** - not invented in this phase.

## 7. Closing - IMPLEMENTED (fixed)
Hunter submits -> Manager/CEO decides (a Hunter, including the owner, cannot decide). **Fixes:** (1) approve is now one transaction (decision + stage + history + handoff record); previously a failure midway left an APPROVED approval on a lead that never became Closed Won and could not be re-decided. (2) A stale approval (the Hunter walked the lead back, or it was closed lost) can no longer move the lead to Closed Won - 409, nothing created; it can still be rejected to clear it. (3) If the queue is down after commit, the decision stands, the handoff stays PENDING, a `queue` SystemEvent is written, and `POST /crm/bpo-handoffs/:id/retry` recovers it (previously the Manager saw a 500 and could not retry).

## 8-10. Payment, commission, revenue - IMPLEMENTED (fixed)
Closed Won never creates a commission. `POST /crm/leads/:id/confirm-payment` (Manager/CEO only) requires Closed Won, an owner, and a SUCCEEDED BPO handoff; creates exactly one Commission (`Commission.leadId` unique) = 10% x amount actually collected (`V1_COMMISSION_PERCENTAGE`; the Hunter's stored rate, even 25%, and the lead's estimated value are ignored) plus one RevenueRecord (tenant, lead, amount, period). **Fix:** commission, revenue record and history are now one transaction - previously a failure after the commission insert left a commission without revenue, and the retry then reported "already confirmed". Concurrency: 8 parallel confirmations -> 1 succeeds, 7 get 409, exactly one commission/revenue/history row. Month-2+ revenue goes through `POST /crm/revenue` and has no path to commissions. Payout: Pending -> Approved -> Paid / Cancelled, CEO only. Audit: `payment.first_confirmed`, `commission.generated`. Revenue is recorded per payment; there is no invoicing/accounting (not invented).

## 11. BPO handoff / client onboarding - PARTIAL
"BPO handoff" is GCO's internal Sales -> Operations step: a job creates the client Tenant (idempotent on lead id; retries bounded; exhausted retries dead-letter with a SystemEvent; recoverable via the retry endpoint, tested). Duplicate decisions cannot create a second handoff/tenant. **Not automated:** creating the client's CLIENT user login and webhook integration - done by the CEO via the admin tenant/user/integration provisioning APIs (E2E 19). Client panel visibility is limited to client-facing data (E2E 05, 20, 23): clients cannot reach any CRM/finance/commission endpoint.

## 12. Operator operations - IMPLEMENTED (existing)
Queue, assignment engine, manual/auto assignment, SLA timeout reassignment, workload, realtime, audit - covered by E2E 01, 03, 04, 05, 11. Not rebuilt.

## 13. Supervision & QA - PARTIAL (wording stays "Supervision & QA")
Operational today: supervisor/team-lead role, escalation queue with internal notes, manager visibility, audit history. Manual: conversation review and feedback. Platform-supported: AI suggestion drafts reviewed by a human operator. **Future:** scored QA sampling, review forms, quality reports. No QA department or certification is claimed.

## 14. Escalation - IMPLEMENTED
Operator -> Supervisor/Team Lead -> GCO Management/Client Contact: reasons, claim, internal vs client-visible notes, resolution, audit (no note content in logs), realtime (no content), RBAC and tenant isolation (E2E 20, 10 tests). Gap: no automatic timeout/reminder for a stuck escalation (it stays visible in queues).

## 15. Reporting - PARTIAL
CEO dashboard: total/closed counts, win rate, pipeline value, MRR (records whose period covers now), total revenue, commissions, pending payouts, leaderboard, awaiting-payment worklist, and net margin = revenue - recorded fulfilment costs - commissions, reported as **unavailable** until fulfilment costs exist (never invented). Manager and Hunter dashboards exist. Limits: dashboards load rows in memory (fine at pilot scale, to be paginated/aggregated later); no per-client or exportable reports.

## 16. RBAC - IMPLEMENTED
Matrix in `lib/auth/rbac.ts`. Verified over HTTP: Hunter cannot confirm payment, decide approvals, change payouts or read manager/CEO dashboards; Manager cannot change payouts; Client/Operator get 403 on CRM and finance endpoints; anonymous 401. Manager lead access untouched.

## 17. Tenant isolation - IMPLEMENTED (app layer, unchanged architecture)
Verified by E2E 05 (conversations/messages), 11 (realtime), 12, 19, 20 (escalations) and 23. No RLS introduced.

## 18. Failure / recovery matrix
| # | Failure | Expected | Actual (tested) | Recovery |
|---|---|---|---|---|
| A | Duplicate pilot submission | one lead, history appended | PASS (E2E 21, 23) | none needed |
| B | Duplicate lead (email/VAT, case variants) | hard 409 | PASS (integration) | - |
| C | Duplicate webhook | one message/usage | PASS (E2E 02, 18) | - |
| D | Webhook auth failure | 401, nothing stored | PASS (E2E 02, 18) | rotate secret |
| E | Webhook/handoff temporary failure | retried with backoff | PASS (E2E 15) | automatic |
| F | Redis unavailable | rate limiter fails open (by design, no hang); approval enqueue failure non-fatal | PASS (integration `bpoEnqueueFailure`) | retry endpoint |
| G | Queue retry exhausted | dead-letter + SystemEvent | PASS (E2E 09, 15) | requeue endpoint |
| H | Duplicate payment confirmation | 409, no second record | PASS | - |
| I | Duplicate commission attempt | impossible (unique + tx) | PASS (8-way race) | - |
| J | Cross-tenant access | 403/404 | PASS (E2E 05, 20) | - |
| K | Unauthorized escalation | 403 | PASS (E2E 20) | - |
| L | Client reads internal notes | never visible | PASS (E2E 20) | - |
| M | Operator unavailable | reassigned on SLA timeout | PASS (E2E 03, 04) | automatic |
| N | Escalation stuck | visible in queues; no auto-reminder | PARTIAL | manual follow-up |
| O | BPO handoff failure | FAILED/dead-letter, no payment/commission possible | PASS (E2E 15, integration) | retry endpoint |

## 19. Test results
Unit 217 (was 215), integration 39 (was 17; +21 `crmOperationalChain`, +1 `bpoEnqueueFailure`), E2E 167 (was 155; +12 `23-operational-chain`). `tsc`, `eslint`, `next build` clean.

## 20. Production status
See the deployment record below.

## 21. Known limitations
No scheduled follow-ups or outbound email; client login/integration provisioning is manual; no stuck-escalation reminders; QA is manual review; no invoicing; dashboards load rows in memory; `confirm-payment` accepts any positive amount (no upper bound or currency field - EUR cents only); month-2+ revenue is entered manually.

## 22. Recommended next phase
**Client onboarding automation:** on successful BPO handoff, create the CLIENT user invitation, default integration/webhook secret, queue and service settings from the lead/pilot form, and a go-live checklist - the last manual step between "Closed Won" and a client's first conversation.
