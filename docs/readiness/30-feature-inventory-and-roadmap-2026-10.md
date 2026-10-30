# 30 — Feature inventory and development roadmap (draft for CEO review), 30 Oct 2026

**Status:** proposal only. It does not authorise implementation, a redesign or any production change (CEO, 29–30 Oct). Any new feature is built and tested in development or staging first; the CEO reviews priorities, estimates and phases before approval.

**How this was produced.** A read-only audit of the repository at commit `978b914` (release candidate), done 30 Oct 2026 by three parallel reviewers against the 20 areas of the CEO's specification, then spot-checked by the CTO on the points that change decisions (no export code anywhere; theme stored in the browser only; two-factor optional by default; hunter commission one-time by design). "Tested" means an automated test file for it exists in the repository; I have not re-run every test for this document (the full suite passed on the release candidate on 29 Oct: unit 730, integration 219, end-to-end 297 passed, 2 AI-off skips/failures explained).

**Live versus release-ready.** The code audited is the release candidate. Production still runs the older version (plus two-factor files). Anything marked implemented that came from the 13 pending migrations (moderation, shifts, absences, knowledge, training, billing, earnings, client requests, privacy tools) is **release-ready, not live**, until Saturday's release is approved and completed.

**Classification used (CEO's six classes).** 1 = implemented and tested · 2 = implemented, needs improvement · 3 = partially implemented · 4 = planned, not started · 5 = completely new · 6 = not recommended (with reason).
**Effort** is one engineer, including tests and review: S = 1–3 days, M = 1–2 weeks, L = 3–6 weeks. These are rough estimates for prioritising, not commitments. **Cost**: "none" means no new recurring cost beyond the current server; any paid service needs the CEO's written approval and a quote, not a guess.

---

## 1. Headline findings

1. **The operational core is strong and tested:** webhook ingestion, assignment with capacity and language routing, SLA timers with a consecutive-expiry cap, operator workspace, escalation and transfer, manager dashboard (queue, coverage, QA, shifts, training, knowledge, handovers, requests), client isolation, billing calculation and invoices, operator earnings and payouts, moderation, privacy requests.
2. **The biggest gaps are around the business layer, not the conversation engine:**
   - **No downloads at all.** There is no CSV, Excel or server-side PDF export anywhere. The only invoice "PDF" is a browser print page.
   - **No broker, HR-recruiter or referral model**, no referral commission, no recruitment reporting. Only a public careers form with four statuses exists.
   - **Hunter commission is one-time by design** (10% of the first month's collected revenue). The CEO now proposes recurring commission; that is a **change to a confirmed business rule** and needs a written decision.
   - **No client contract layer:** no contract start/end/renewal/notice, pilot dates, legal entity, country, account owner; no 16-step integration milestone tracker with owners and deadlines (only an 11-item go-live checklist without dates).
   - **Founder dashboard is one long page** with no KPI drill-down, no unified attention list, no deadlines; financial view has outstanding and run-rate but no invoiced/collected/forecast split.
   - **No task/deadline system**, no reminders; calendar is only a Calendly link.
   - **Roles are fixed in code** and cannot be assigned or removed from the UI/API; roles for Finance, QA, Recruiter, Broker, Client Viewer/Admin do not exist.
   - **Two-factor sign-in exists but is off by default** (enabled only by an environment setting).
3. **Security and safety are in good shape for the current stage, with known gaps to close before real clients (see P0).**

---

## 2. Inventory by requirement area

Columns: **Class** (1–6) · **Where it is today** · **Roles** · **Main limitation** · **Proposed improvement** · **Priority** · **Effort**.

### 1. Founder dashboard

| Function | Class | Today (page/module) | Limitation | Improvement | Pri | Effort |
|---|---|---|---|---|---|---|
| Company overview: clients, operators online, active conversations, open slots, 7-day shifts, SLA %, QA % | 1 | `/admin` Executive panel (`lib/executive/overview.ts`) | One stacked page | Sectioned navigation (see 18) | P1 | M |
| Counts by stage (onboarding, awaiting integration, pilot), contracts, headcount by role | 3 | Tenant status only ACTIVE/SUSPENDED/ARCHIVED | No lifecycle stage or contract data | Add client lifecycle stage + contract fields (see 2) | P0 | M |
| Uncovered shifts, incidents, escalations, approvals, deadlines | 3 | Alerts/escalations/approvals panels; coverage per client in alerts | No single list; no deadlines | "Requires my attention" unified list | P1 | M |
| Revenue, operator cost, margin per client; run-rate projection; outstanding invoices | 1 | Executive overview | No invoiced vs collected split, no forecast, infra cost not surfaced | Add invoiced/collected/overdue; monthly cost table | P0 | M |
| MRR, forecasts, annual performance | 3 | MRR from CRM dashboard; run-rate only | No forecast model | Simple forecast from contracted fees + volume | P2 | M |
| Infrastructure and software costs | 3 | `FulfillmentCost` manual entry | Not shown, not recurring | Recurring cost lines | P1 | S |
| KPI drill-down to records | 5 | Links to billing/privacy only | No drill-down | Click-through for revenue, margin, SLA, QA | P1 | L |
| Create client | 1 | `/admin/clients/new` wizard | — | — | — | — |
| Invite staff / create user | 1 | Invitations, `POST admin/users` | — | — | — | — |
| Assign/remove roles, deactivate users, assign managers to clients | 5 | CLI tool `prisma/ops/staff-account.ts` only | No UI/API; manager bound to one client | Role change/deactivate with confirmation and audit; multi-client manager only if needed | P1 | M |
| Billing rates, compensation rules, payouts | 1 | `/admin/billing`, `/admin/earnings` | EUR only | — | — | — |
| Partners, global settings | 5 | none | — | Partner records with agreements (see 7–9) | P1 | M |
| Audit of sensitive changes | 3 | `AuditLog` covers most config, billing, earnings, privacy | Exports and role changes not covered (none exist yet) | Audit every export and role change | P0 | S |

### 2. Client lifecycle

| Function | Class | Today | Limitation | Improvement | Pri | Effort |
|---|---|---|---|---|---|---|
| Name, timezone, hours, SLA, capacity, billing model, fees, VAT, payment terms | 1 | `Tenant`, `TenantService` | EUR only | — | — | — |
| Legal entity, country, account owner, contacts, channels, escalation procedure, reporting obligations | 5 | partly in onboarding JSON | Unstructured | Add structured client profile | P0 | M |
| Contract start/end/renewal/notice, pilot start/end, agreed service hours | 5 | none | Not stored | Contract fields + renewal alerts | P0 | M |
| Documents, change history | 3 | Audit log only | No per-client history view | Client history tab from audit log; document list | P1 | M |
| 16 integration milestones with owner, status, expected/actual dates, progress bar, alerts | 5 | 11-item go-live checklist (`lib/onboarding/service.ts`), no dates/owners | Cannot see deadlines | Milestone table per client; overdue alerts; visible to Founder/manager/CTO/client | P0 (minimal) / P1 (full) | M |
| "Not live because configured" rule | 1 | Go-live is CEO-only and gated by the checklist | — | Keep; make the gate use milestones | P0 | S |

### 3. Integration management

| Function | Class | Today | Limitation | Improvement | Pri | Effort |
|---|---|---|---|---|---|---|
| Generic signed webhook (HMAC, replay window, dedup, retries) | 1 | `gco-webhook` adapter, contract doc | Only production connector | — | — | — |
| Dev-mock distinguished from production | 1 | `productionCapable` flag | — | — | — | — |
| Status model (12 states wanted) | 3 | ACTIVE / DISABLED / DEGRADED | Too few states | Add lifecycle statuses (Discovery … Live, Failed, Suspended) | P0 | S |
| Sandbox vs production environment | 5 | none | — | Environment field per integration | P0 | S |
| Verify connection | 1 | `admin/integrations/[id]/verify` | Result not stored as history | Store test results | P0 | S |
| Per-client health, last success, delivery success/failure, retry/error log | 3 | System health and webhook events global | Not per client | Integration health page | P0 | M |
| Approval status, version/change history, maintenance date | 5 | audit log only | — | Fields + history | P1 | M |
| Feasibility checklist for new requests | 3 | documents only | Not in app | Form in app that produces a go/no-go note | P1 | S |
| Zendesk, Gorgias, Intercom, Shopify connectors | 5 | none | Not implemented | Build only against a real client sandbox and spec; **do not advertise** | P1+ (per client) | L each |

### 4. Manager/supervisor dashboard — class 1 for most

Queue, availability, assign/reassign/transfer, coverage, SLA alerts, QA, escalations, training, handovers, weekly reports, knowledge, moderation, client requests all exist and are tested (`app/manager`). Gaps: manager tied to **one** client (multi-client assignment not supported); no manager-to-team messaging; no incident report to Founder (closest is escalation); manager action audit partial. **Proposal:** keep one-client managers until a real need appears (P2); add "report incident" to Founder (P1, S); audit all manager actions (P0, S). Per-client manager scoping already holds (tested).

### 5. Operator dashboard

| Function | Class | Today | Gap / proposal | Pri | Effort |
|---|---|---|---|---|---|
| Conversations, reply, SLA timer, status, quick replies/instructions, escalate, transfer, handover notes, shifts, capacity, performance report, training | 1 | `app/operator` | — | — | — |
| New-message alert sound/push | 3 | Realtime refresh + bell | Add sound/notification | P1 | S |
| Conversation priority/overdue list | 3 | Timer only | Priority and overdue markers | P1 | S |
| Delivery status of each reply | 3 | Stored, not clearly shown in thread | Show sent/delivered/failed | P0 | S |
| History beyond active conversations | 3 | Last 30 messages of active only | Controlled history view | P1 | M |
| Availability confirmation and work sessions | 5 | Status selector only | Optional; shifts are a preference by design | P2 | M |
| Time-off requests | 5 | Managers create absences only | Request + approve flow | P1 | M |
| Earnings: today/week/month/paid/outstanding, adjustments | 1 | `/operator/earnings` | — | — | — |
| Earnings by client/period, disputes, statements | 5 | none | Group by client; dispute note; PDF/CSV statement | P1 | M |

### 6. Client portal

| Function | Class | Today | Gap / proposal | Pri | Effort |
|---|---|---|---|---|---|
| Live status, SLA, 14-day performance, tickets, change requests, escalation decisions, moderation, privacy requests, onboarding progress | 1 | `/client-panel` | — | — | — |
| Invoices list | 3 | list only | Invoice PDF/CSV download (needs legal business details, now placeholders) | P0 | M |
| Contract/service view, account manager, renewal dates, documents | 5 | none | Read-only contract card | P1 | M |
| Integration status for the client | 5 | none | Read-only status + milestones | P1 | S |
| Conversation samples/transcripts | 5 | agreed for managers only | Authorised sample access with audit | P1 | M |
| Monthly report download | 5 | on-screen only | PDF/CSV monthly report | P0 (basic) | M |
| Client admin vs read-only users | 5 | one CLIENT role | Two client roles | P1 | M |
| No internal margins/pay/commissions leak | 1 | route-level permission tests | Per-field leak test | P0 | S |

### 7. Hunter dashboard

| Function | Class | Today | Gap / proposal | Pri | Effort |
|---|---|---|---|---|---|
| Register prospects, duplicate block, claim with 30-day lock, pipeline, approval (no self-approval) | 1 | `/hunter`, `lib/crm` | — | — | — |
| Commission only after GCO collected payment | 1 | created at "confirm first payment" | — | — | — |
| **Recurring commission**, durations, triggers, termination | 5 | **one-time by design** | **CEO decision needed** (changes a confirmed rule); needs per-hunter agreement terms | P1 | L |
| Edit rate per hunter | 3 | field exists, no UI | Rate edit with audit | P1 | S |
| Commission statements | 5 | none | PDF/CSV statement | P1 | S |

### 8. Broker / BPO partner

Class 5 (nothing exists). **Recommendation:** do not build a separate dashboard per partner type yet. Build one "Partner" account type with a type field (hunter, broker, subcontractor, commercial partner) and a written agreement record (rate, base, duration, conditions, clawback), then expose limited dashboards. Opportunity registration (volumes, languages, budget, start date, briefs) and statements are P1; separate broker UX is P2. Effort L.

### 9. HR / recruiter / agency

Class 5 (only the careers form exists; stages NEW/REVIEWING/ACCEPTED/REJECTED; no referrer, tests or onboarding stage). The earnings data that would feed a commission exists (approved earning lines, adjustments, payouts). **Needed:** referral record, candidate stages (referred, accepted, tested, approved, onboarded, first paid work), recruiter role and dashboard, commission ledger, statements, recruitment campaigns and reports. Priority P1 (needed when the first agency agreement is signed), effort L. **Recommended commission rule** (to be fixed in the written agreement before building):
- **Base:** operator earnings in **approved/payable** state, net of rejections, reversals and disputed amounts. Not "delivered" or "registered".
- **Window:** three consecutive calendar months starting with the month of the operator's first approved paid work (anchor on a stored first-paid-work date, not on registration).
- **Accrual and payment:** accrues as the operator's earnings become payable; paid to the agency only after the operator earning itself is paid (no pay-out on unpaid or reversed work).
- **Early leave / inactive:** commission stops when earnings stop; no minimum guarantee.
- **Rejected or never-started candidates:** no commission.
- **Duplicate referrals:** first valid, time-stamped referral wins; disputes handled by the Founder with an audit entry.
- **Percentage changes:** apply only to future referrals; the rate is snapshotted when the referral is accepted.
- **Reversals/clawbacks:** negative adjustments reduce the next statement; no negative payouts.
- **Late or cancelled payments:** follow the operator payout state.
- **Visibility:** the agency sees only its referred operators' eligible earnings, identified by referral ID unless authorised.

### 10. Finance and billing

| Function | Class | Today | Gap / proposal | Pri | Effort |
|---|---|---|---|---|---|
| Per-message, per-ticket, hourly, monthly fixed billing; VAT; due dates; gap-free invoice numbers; overlap block | 1 | `lib/billing`, `/admin/billing` | — | — | — |
| Hybrid billing | 5 | none | Combine fixed + variable | P1 | M |
| Multiple currencies | 5 | EUR only | Only when a client requires it | P2 | L |
| Reconciliation (billed vs invoiced vs owed vs margin, with mismatch flags) | 1 | `admin/billing/reconciliation` | — | — | — |
| Payments received, partial payments, overdue/aging, credit notes, disputes | 3 | one payment reference per invoice | Payment ledger, aging report, credit notes | P0 (overdue + payment record) / P1 | M |
| Forecast vs billable vs invoiced vs collected vs accrued | 3 | states exist per module, no unified view | One finance view with these definitions | P1 | M |
| Operator, hunter, manager costs | 3 | operators and hunters; manager cost not modelled | Cost lines | P1 | M |
| Invoice document | 2 | HTML print page | Server PDF with correct business details | P0 | M |
| Legal/e-invoicing compliance | 5 | none; GCO legal details are placeholders | **Do not present the print page as a tax invoice.** Use an accountant and an e-invoicing/accounting provider; integrate later | P1 | M; **recurring cost: to be quoted** |

### 11. Reports and exports

All reports are JSON or on-screen. **No CSV/XLSX/PDF/TXT/JSON file export, no secure expiring links, no scheduled reports, no export audit, no client data portability** (class 5). **Proposal:** a small export service (CSV first, then XLSX and PDF) with role-checked filters (date, client, language, status), audit entry per export, expiring download links, retention limit, no raw personal data by default. P0: CSV for invoices, usage, reconciliation and operator earnings, plus the client monthly report. P1: executive/finance pack, HR/hunter statements, scheduled monthly reports, whole-client portability. Effort M for the service, S per additional report.

### 12. Deadlines, calendar and tasks

Class 5 (no task model, no reminders; Calendly link only; no Google Calendar). **Proposal:** a simple Task/Deadline model (owner, client, priority, due date and timezone, status, dependencies) with overdue alerts and a Founder "upcoming/overdue" widget, fed first by contract and integration milestones and invoice due dates. P1, effort M. Google Calendar/Calendly sync P2. Unassigned/inactive lead reminders P1, S.

### 13. Knowledge and communication

Class 3. Knowledge entries (quick replies, articles, instructions) per client, tested. **Missing:** versions, approval/publication workflow, acknowledgement of changes, announcements, manager-to-operator messaging. Today edits overwrite in place, so "current approved version" does not exist. **Proposal:** version history + approve/publish + acknowledgement for INSTRUCTION entries first (P1, M); announcements/messaging P2.

### 14. QA and training

QA is class 3 (fixed 1–5 scores for accuracy, tone, resolution; flags; queue of replies; 30-day averages). **Missing:** configurable and client-specific scorecards, sampling plans, critical-error categories beyond flags, appeals, trends, operator/founder views. Training is class 3 (materials, scored tests, qualifications). **Missing:** auto-certification from a test, expiry/refresher, completion report, and **enforcement in the assignment engine** (today the training gate applies only when an operator goes Available). **Proposal:** P0 only if a launch client requires a certification: enforce the client-approval qualification in assignment (touches the core pipeline, so it needs explicit approval); P1 for scorecards, trends, appeals, expiry.

### 15. Workforce and capacity

Shifts, absences, coverage, capacity limits and language routing exist and are tested (class 1). **Missing:** workload forecast, recruitment gaps, onboarding needs, **capacity simulator** (class 5). **Proposal:** a spreadsheet-based capacity model first (hours = messages × handling time ÷ occupancy, with stated assumptions), moved into the app only when it is used regularly. P2, S now / M later. Always labelled a forecast, never a guarantee.

### 16. Notifications, incidents, approvals

Class 3. Alerts are computed on read (no stored status, no acknowledgement, no owner or history); notifications have no severity or status; "approval" exists only for lead-to-won. **Proposal:** a stored Alert/Incident record (severity, client, owner, status, history, required action), a generic approval request used first for payouts, commission, role changes and go-live. P1, L. P0: make sure the alerts that matter (no operators, SLA breach, delivery failure, integration down) reach someone by email.

### 17. Users, permissions, audit

| Function | Class | Today | Gap / proposal | Pri | Effort |
|---|---|---|---|---|---|
| Roles: CEO_ADMIN, CTO, Manager, Supervisor, Assistant, Operator, Client, Hunter | 1 | fixed in `lib/auth/rbac.ts` | Missing Finance, QA, Recruiter, Broker/Partner, Client Viewer/Admin, internal Recruitment Manager, COO | add by need | P1 | M |
| Editable permission matrix | 5 | none | **Not recommended yet (6):** fixed roles with clear permissions are safer and cheaper; revisit at ~10+ roles | P2 | L |
| Server-side authorisation and client isolation | 1 | tested (tenant isolation, RBAC) | — | — | — |
| Two-factor sign-in | 2 | implemented, **off unless configured** | Require for CEO_ADMIN, CTO, billing roles | **P0** | S (config + CEO approval) |
| Audit log | 2 | broad coverage, no edit/delete path | Add DB-level immutability and cover exports/role changes | P0 | S–M |
| Account controls | 3 | CLI only | See 1 | P1 | M |

### 18. UI/UX and themes

Class 2–3. Light/dark toggle exists on admin, manager and client pages, stored **per browser only**, no "follow system" mode, not on every role's pages; the Founder page has no navigation. **Proposal:** theme stored per user account (synced across devices) with light/dark/system; sectioned Founder navigation (Overview, Sales & Partnerships, Clients, Integrations, Operations, Workforce, Recruitment & HR, Finance, Reports & Exports, Calendar & Tasks, Approvals, Settings & Security — the CEO's list is sensible; I would build it incrementally, section by section); responsive and accessibility pass with automated checks. P1, M–L. The CTO's recommendation is to do the navigation first because it gives the Founder value immediately.

### 19. Reliability, testing and scale

- **Strong coverage:** webhook flow, dedup, assignment and capacity races, dead-letter recovery, isolation, RBAC, SLA, billing and earnings calculation, integration failure. **Gaps:** delivery-ack detail, retry behaviour, report accuracy, export permissions, automated backup/restore and rollback tests (done manually, documented).
- **Measured capacity:** 1,000 messages per minute sustained for 3 minutes, 3,000 of 3,000 stored, acknowledgement p99 31 ms — on a **developer laptop** with mock AI, no network, one worker. This is **not** a production capacity figure. Not tested: long soak, many simultaneous operators, production topology.
- **Production topology:** one 8 GB server runs everything (web, worker, realtime, database, Redis, proxy), no container limits, no replicas. That is appropriate for the first clients, not for hundreds of operators.
- **Recommendation:** run a production-like load test on staging, then publish realistic targets. Until then claim nothing beyond "tested to 1,000 messages/minute in a development environment". Plan to separate the database and add monitoring/alerting before several clients go live. AI stays disabled (verified: master switch off, tested). P0: production-like load test and monitoring; P1: infrastructure split and sizing plan. Hosting upgrade costs: to be quoted.

### 20. Not recommended or to challenge

- **Editable permission matrix, COO role and multiple manager-client assignment now** — add when a real need exists (class 6 for now).
- **Multi-currency now** — only when a signed client requires it.
- **Separate dashboards per partner type** — start with one Partner model (see 8).
- **Treating the internal invoice page as a compliant tax invoice** — no; integrate with an accountant/provider.
- **Broad TXT/JSON transcript exports** — privacy risk; limit to authorised samples with audit.
- **Advertising Zendesk/Gorgias/Intercom/Shopify** — none exist; scope per client.
- **Capacity claims beyond measured** — see 19.

---

## 3. Phased roadmap

### P0 — before the first real client (target: all closed before real client data)
1. **Release** of the pending version, then remove the OpenAI key after it is stable.
2. **Backups:** restricted Backblaze key, 30-day lifecycle rule, offsite restore proven; alert on failed upload.
3. **Access security:** enforce two-factor for CEO_ADMIN and CTO; switch off the five production demo accounts (`prisma/ops/disable-demo-accounts.ts`) once the Founder login is confirmed; audit-log immutability.
4. **Client contract fields and a minimal integration milestone tracker** with owners and dates and overdue alerts; integration statuses and sandbox/production field; per-client integration health.
5. **Finance essentials:** real GCO legal/billing details, invoice PDF, payment record and overdue report, CSV exports (invoices, usage, reconciliation, earnings), client monthly report; no tax-compliance claim.
6. **Operator:** delivery status visible per reply.
7. **Quality gates:** per-field leak tests for the client portal; production-like load test; monitoring and alerting.
8. **Qualification enforcement in assignment** only if the first client requires certification (needs explicit approval to touch the core pipeline).

### P1 — professional multi-role platform
Founder sectioned navigation, KPI drill-down and "Requires my attention"; user/role management UI; unified alert/incident/approval centre; task and deadline system; knowledge versions and approvals; QA scorecards and appeals; operator time-off, earnings by client and statements; client contract card, integration status, transcript samples and client admin/viewer roles; Partner model, HR referral and commission ledger, hunter recurring/terms and statements (after written agreements); finance unification (forecast/invoiced/collected), accounting/e-invoicing integration; per-user theme; infrastructure split.

### P2 — growth
Capacity simulator and workforce forecasting, scheduled analytics, Google Calendar sync, broader connectors per client, multi-currency, editable permissions, advanced workflow automation, manager multi-client assignment.

---

## 4. Decisions needed from the CEO
1. **Hunter commission:** keep one-time (first month, as confirmed earlier) or change to recurring? A change affects existing documents and any signed agreement.
2. **HR commission rule:** approve the recommended rule in section 9 as the starting point for the written agreement (legal review recommended).
3. **Two-factor** required for Founder and CTO accounts (P0): approve.
4. **Priorities:** confirm P0 list and which first-client requirements (languages, certification, integration platform) shape it; the first partner brief will tell us.
5. **Paid services** (accounting/e-invoicing provider, monitoring, larger infrastructure): approve quotes before any purchase.
6. **Build order for the Founder dashboard:** navigation first, then drill-down and attention list.

Nothing in this document has been built or deployed.
