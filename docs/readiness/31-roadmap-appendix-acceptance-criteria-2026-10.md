# 31 — Roadmap appendix: dependencies, security, acceptance criteria, tests, capacity, costs (30 Oct 2026)

Companion to `30-feature-inventory-and-roadmap-2026-10.md`. Completes the fields the CEO asked for in section 20 (dependencies, security and integration considerations, acceptance criteria, recurring cost), the technical capability checklist for new client requests (section 3), the documented-testing view (section 19) and capacity targets. **Proposal only: nothing is authorised or built.** Effort sizes: S = 1–3 days, M = 1–2 weeks, L = 3–6 weeks, one engineer including tests (rough estimates). **Recurring cost** is "none" unless a paid service is named; any paid service needs a quote and the CEO's written approval.

**Working rules for every item:** built and tested in development/staging first; server-side permission checks; every create/change/export writes an audit entry; additive database migrations only; client isolation test added or extended; no AI features.

---

## A. P0 items (before the first real client)

### P0-1 Release of the pending version (already prepared)
- **Depends on:** CEO written approval; fresh pre-release backup; rollback tags (done 29 Oct).
- **Security:** AI stays disabled; rollback procedure proven twice.
- **Acceptance:** 29 migrations applied, 0 failed; health `ai: disabled`; smoke test (sign-in, simulated message assigned, operator reply delivered, tenant isolation, three services healthy) passes; zero OpenAI usage afterwards; or rollback executed within the plan's criteria.
- **Effort / cost:** done / none.

### P0-2 Offsite backup hardening
- **Depends on:** account owner creates the restricted key; approved 30-day retention.
- **Security:** key has only upload (and list) permission; read key offline; **backup encryption is not active yet:** the release ships the optional age encryption, but it switches on only when the CEO's two public keys are installed in `/etc/gco-backup-age-recipients.txt` (checked 30 Oct: the file does not exist, so dumps are uploaded unencrypted today). Installing the keys is part of this item; the CEO keeps the private keys.
- **Acceptance:** key check shows no delete/read/retention/encryption/key-write permission; one nightly upload succeeds with the new key; an offsite download (decrypted by the CEO once encryption is on) is restored into a throwaway database with correct counts; lifecycle rule verified on the bucket; failed-upload alert tested; old key deleted only afterwards.
- **Effort / cost:** S / bucket storage only (existing).

### P0-3 Access security
- **What:** require two-factor sign-in for CEO_ADMIN and CTO (existing setting `REQUIRE_TWO_FACTOR_ROLES`); switch off the five production `@demo.gco` accounts with the existing operator tool; audit-log protection against edit/delete at database level.
- **Depends on:** CEO enrols two-factor first (so he is not locked out); recovery codes stored; CEO approval of the production change.
- **Security:** recovery path tested on staging (`26-two-factor-verification-and-recovery.md`); demo accounts disabled only after Founder login confirmed.
- **Acceptance:** a CEO_ADMIN login without a second factor is refused; recovery code works on staging; demo accounts cannot sign in; attempt to update or delete an audit row is rejected by the database; audit shows who disabled what.
- **Effort / cost:** S–M / none.

### P0-4 Client contract profile and minimal integration milestone tracker
- **What:** structured client profile (legal name, country, account owner, contacts, channels, escalation procedure, reporting obligations); contract start/end/renewal/notice; pilot start/end; milestone table (the CEO's 16 milestones) with owner, status, expected and actual date; overdue and upcoming alerts; the go-live gate uses the milestones.
- **Depends on:** database migration; existing onboarding checklist and alert routes; calendar of owners (users).
- **Security:** visible to Founder, the client's manager and CTO; client sees only milestones marked client-visible; edits audited; a client is "live" only when go-live is explicitly approved by the Founder, never from configuration alone.
- **Acceptance:** each milestone has owner, status, expected and actual date; a milestone past its date shows overdue and alerts the owner and Founder; a manager of client A cannot read client B milestones (automated test); client portal shows only client-visible milestones; go-live is refused while required milestones are open.
- **Effort / cost:** M / none.

### P0-5 Integration status, environment and health
- **What:** extend integration statuses (Not Started … Live, Degraded, Failed, Suspended); sandbox/production field; stored verification results; per-client health page (last successful connection, delivery success/failure counts, retry and error log).
- **Depends on:** existing webhook events, delivery queue, verification route; P0-4 for dates.
- **Security:** credentials never displayed (status only); secret rotation stays audited; development simulation shown with a clear "simulation" label and cannot be set Live.
- **Acceptance:** a dev-mock integration cannot reach Live; a failed outbound delivery appears in the health page with its error and retry count; switching sandbox to production requires Founder/CTO approval and writes an audit entry; counts match the database in a test.
- **Effort / cost:** M / none.

### P0-6 Finance essentials
- **What:** real GCO legal and billing details; invoice PDF generated by the server; payment record (date, amount, reference) and overdue report; CSV exports for invoices, usage, reconciliation and operator earnings; client monthly report (PDF/CSV).
- **Depends on:** CEO/accountant supply legal details, VAT number and invoice wording; P0-7 export service.
- **Security:** finance data visible only to Founder and permitted roles; a client sees only its own invoices; no tax-compliance claim (an internal PDF is not a tax invoice); duplicate payment records prevented.
- **Acceptance:** PDF matches the stored invoice totals to the cent in a test; a second payment for a paid invoice is rejected; overdue list matches due dates; client downloads only own invoices; no internal margin appears in any client-visible file.
- **Effort / cost:** M / none (open-source PDF generation). Accounting/e-invoicing provider is P1 and **to be quoted**.

### P0-7 Export service (foundation)
- **What:** one service that creates CSV (later XLSX/PDF) with role-checked filters (date, client, language, status), an audit entry for every export, expiring download links, retention limit, no raw personal data unless the role allows it.
- **Depends on:** role permissions; audit log; storage location on the server.
- **Security:** links expire (default proposal: 24 hours) and are single user; exports of personal data need an explicit permission; file purge after retention; rate limits.
- **Acceptance:** each export writes "who, what, filters, row count"; a user without permission gets 403; another user's link fails; expired link fails; files are removed after the retention period (test with shortened period).
- **Effort / cost:** M / none.

### P0-8 Operator delivery status
- **What:** show per-reply status (pending, sent, delivered, failed) in the operator thread.
- **Depends on:** existing message status.
- **Acceptance:** a simulated failed delivery shows failed within seconds; delivered shows delivered; no change to the sending pipeline.
- **Effort / cost:** S / none.

### P0-9 Client portal leak tests
- **What:** automated per-field tests proving a client never receives margins, operator pay, commissions, sales data or other clients' data in any response.
- **Acceptance:** tests fail if a forbidden field appears in any client-role API response (checked against a list of forbidden field names across all client endpoints).
- **Effort / cost:** S / none.

### P0-10 Production-like load test and monitoring
- **What:** load test on a staging copy sized like production, with realistic mix (many concurrent operators, webhook bursts, outbound retries); error monitoring and uptime alerts to the Founder and CTO.
- **Depends on:** staging environment; approved alert email/phone route; a paid error-monitoring plan is optional and needs a quote.
- **Acceptance:** documented results (rates, latency, error rate, resource use, first bottleneck); alert fires within minutes when web, worker or database is stopped on staging.
- **Effort / cost:** M / monitoring service to be quoted.

### P0-11 Qualification enforcement in assignment (only if a first client requires certification)
- **Touches the core pipeline** (`lib/assignment`), so it needs explicit approval for that area.
- **Acceptance:** an operator lacking the client's required qualification is never assigned that client's conversation (race and capacity tests still pass); the manager sees why the queue is waiting.
- **Effort / cost:** M / none.

---

## B. P1 items (professional multi-role platform)

| ID | Item | Depends on | Security / integration | Acceptance criteria (short) | Effort | Recurring cost |
|---|---|---|---|---|---|---|
| P1-1 | Founder sectioned navigation + "Requires my attention" | P0-4, alerts | Founder-only data stays behind permission | Each section loads separately; attention list shows overdue milestones, approvals, escalations, failed integrations, overdue invoices with one-click open | M | none |
| P1-2 | KPI drill-down | P1-1 | Same permissions as the underlying record | Clicking client revenue lists the invoices and billable usage that sum to the number (checked in a test) | L | none |
| P1-3 | User and role management UI | audit; role list | Confirmation step; cannot remove the last Founder; changes audited; no password visible | Founder changes a role and the change takes effect on next request; audit entry exists; cannot self-lock-out | M | none |
| P1-4 | New roles (Finance, QA, Recruiter, Partner, Client Admin/Viewer, internal Recruitment Manager) | P1-3 | Each role's permissions listed in a table and tested | A Client Viewer cannot edit; Finance cannot see client conversations; Recruiter sees only referred operators | M | none |
| P1-5 | Unified alert/incident/approval centre | P0-4, P0-5 | Severity routing; approvals for payouts, commissions, role changes, go-live | An alert has severity, client, owner, status, history; unresolved critical alerts escalate; approval cannot be self-approved | L | email/SMS provider (quote) |
| P1-6 | Task and deadline system | P0-4 | Owner and client scoping | Overdue task notifies owner and Founder; milestones and invoice due dates appear as tasks | M | none |
| P1-7 | Knowledge versions and publication | knowledge module | Operators only see the approved version; acknowledgement recorded | Editing creates a new draft; publish needs approval; operators must acknowledge changes; report shows who has not | M | none |
| P1-8 | QA scorecards, appeals, trends | QA module | Reviewer scoping unchanged | Client-specific scorecard; operator can appeal; manager resolves; trend by month | M–L | none |
| P1-9 | Operator time-off requests; earnings by client; statements; disputes | P0-7 | Operator sees only own data | Request approved/rejected with audit; statement totals equal the ledger | M | none |
| P1-10 | Client portal: contract card, integration status, transcript samples, client admin/viewer | P0-4, P0-5, P1-4 | Samples only when authorised; every view audited | Client viewer cannot change settings; sample access logged; contract shows only client-visible fields | M–L | none |
| P1-11 | Partner model + hunter terms (recurring only after the decision) | CEO decision, written agreements | Hunters cannot approve own commission or edit prices; attribution and dispute record | Commission calculated per agreement terms in tests (rate, base, duration, trigger, clawback); statement matches ledger | L | none |
| P1-12 | HR referral and commission ledger | P1-4, P1-11, earnings ledger | Agency sees only referred operators' eligible earnings; privacy review | Rule from doc 30 §9 implemented in tests: window end stops accrual, reversal reduces next statement, duplicate referral resolved by first valid timestamp, percentage change not retroactive | L | none |
| P1-13 | Unified finance view and costs | P0-6 | Finance permission only | Forecast, billable, invoiced, collected, accrued, approved, paid shown separately; no double counting (test) | M | none |
| P1-14 | Accounting / e-invoicing integration | accountant advice, provider choice | Legal compliance via provider, not claimed by GCO | Invoices reach the provider and return a compliance status; failures visible | M | **provider fee: to be quoted** |
| P1-15 | Per-user theme (light/dark/system) | none | none | Choice saved in the account, same on another device, follows system when chosen | S | none |
| P1-16 | Infrastructure split and sizing plan | P0-10 results | Backups, secrets, access unchanged | Database on its own host or managed service with tested restore; capacity table updated from measurements | M | **hosting: to be quoted** |

## C. P2 items
Capacity simulator and forecasting, scheduled analytics, Google Calendar sync, broader connectors (each against a real client sandbox), multi-currency, editable permission matrix, manager multi-client assignment, workflow automation. Dependencies and acceptance criteria will be written when a signed client needs them.

---

## D. Technical capability checklist for a new client request (use before any commitment)

Use with `docs/integration-feasibility-template.md` and `docs/client-capability-matrix.md`. **Do not state any connector as available until it is implemented and tested.** The only connector that exists today is the generic signed webhook interface.

1. **Client platform:** name, plan/tier (e.g. Zendesk Suite, Gorgias, Intercom, Shopify Plus, proprietary).
2. **Message flow:** which channels (chat, email, social, WhatsApp); inbound only, outbound replies, or both; expected volume per day and peak per minute.
3. **API and webhooks:** inbound webhook or polling; payload format; authentication method; signing; rate limits; retry behaviour; idempotency keys; sandbox available; access and credential owner and the date credentials will be provided.
4. **Replies:** how a reply is sent back (API endpoint, rate limits, attachments), and how delivery is confirmed.
5. **Data access needs:** customer or order lookups; personal data involved; data location and retention requirements; DPA and subprocessor needs.
6. **Languages, hours and SLA:** languages, coverage hours and time zones, response-time targets, escalation contacts.
7. **Approvals:** client security review, platform app approval (e.g. Meta business verification), legal sign-off.
8. **Effort and risk:** category from `docs/client-integration-estimation.md`; external dependencies; what we can already reuse.
9. **Delivery plan:** milestone dates (the 16 milestones), owners, testing and client approval, pilot, go-live, first review.
10. **Decision:** feasible / feasible with conditions / not feasible, written by the CTO and reviewed with the Founder **before** anything is promised to the client or partner.

---

## E. Testing view (CEO section 19): what is covered and what is open

| Area | Automated evidence today (test files exist; suite passed on 29 Oct) | Gap to close |
|---|---|---|
| Inbound/outbound flow | e2e 01, 01b (AI off), 25, 53 | — |
| Delivery acknowledgement | covered inside the lifecycle tests | dedicated ack-failure test (P0-8) |
| Retries, duplicates | webhook dedup and delivery integration tests; dead-letter recovery e2e 09 | explicit retry-count test |
| Assignment, reallocation, capacity | assignment policy unit, capacity race integration, e2e 03, 50, 51 | qualification rule (P0-11) |
| Client isolation | e2e 05, tenant guard unit | portal per-field leak tests (P0-9) |
| Role permissions | rbac unit, e2e 06, route access checks | tests for each new role (P1-4) |
| SLA timers and coverage | SLA cap unit/integration, e2e 04, 26, coverage tests | — |
| Billing and compensation | billing calc unit, invoices and earnings ledger integration | payment record, overdue, credit (P0-6) |
| HR commission expiry/adjustments | none (not built) | built with P1-12 |
| Reporting accuracy | executive projection unit, weekly report tests | totals-equal-records tests (P1-2) |
| Export permissions | none (no exports) | built with P0-7 |
| Backup and restore | manual drills documented (two isolated rollback rehearsals, restore tests); no automation | scripted monthly restore drill with alert |
| Rollback | rehearsed twice on 29 Oct | repeat on the live stack in the release window |
| Integration failures | outbound failure integration tests | per-client health tests (P0-5) |
| Performance | one development-laptop test, 1,000 msg/min sustained 3 min | P0-10 |

---

## F. Capacity targets and infrastructure (proposal, **not measured**)

**Today:** one 8 GB, 4 vCPU server runs web, worker, realtime, database, Redis and proxy with no container limits, one worker process and one realtime process. Measured only in development: 1,000 messages/minute for 3 minutes with mock AI. **We claim nothing beyond that.**

| Stage | Proposed planning target | Needed before moving to it |
|---|---|---|
| 1 — first clients, pilot | a few clients, up to roughly 20 simultaneously active operators, volume in the low tens of thousands of messages per month | P0 list; production-like load test passes with headroom (target: peak at least 3× expected, no message loss, stable latency) |
| 2 — several clients | around 50–100 operators, hundreds of thousands of messages per month | P1-16: separate database host, container limits, more worker capacity, monitoring and alert routing, tested restore, second realtime process if needed |
| 3 — hundreds of operators | the CEO's growth ambition | managed or replicated database, queue and cache separation, multiple web/worker instances behind a load balancer, capacity review each quarter; not planned in detail until stage 2 data exists |

These numbers are **planning targets to be confirmed by load tests, not capacity claims.** The first measurable question is where the single server saturates first (database, worker or realtime); P0-10 answers it.

**Capacity simulator assumptions (P2, example the CEO gave: 20,000 messages per month in German).** Operator hours depend on handling time per message, occupancy and coverage hours; these must come from real operations data. Until then any estimate is a spreadsheet with stated assumptions and a risk note, labelled "forecast, not guaranteed capacity".

## G. Cost notes
No cost is invented here. Existing: the server and storage already in use. **Possible new recurring costs, each needing a quote and written approval:** accounting/e-invoicing provider (P1-14), error monitoring and uptime alerts (P0-10), email/SMS alert delivery (P1-5), larger or additional hosting (P1-16), Google Workspace seats for new staff, any client-platform connector licences a specific client requires.
