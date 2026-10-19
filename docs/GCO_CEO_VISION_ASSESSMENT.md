# GCO — Assessment of the CEO's "One CRM, Six Services" Vision

**Prepared by:** CTO office · **Commit under review:** `80b907d` (HEAD at time of writing) · **Date:** 2026-10-19
**Method:** `gco-production-readiness`. Statuses use VERIFIED / PARTIAL / MISSING / BLOCKED / NOT VERIFIED. Feature statuses come from code and schema read this session (grep for real read/write use, not just schema presence). Older docs (`GCO_PRODUCTION_GAP_REGISTER.md`, audited at `6ffc8d5`) are used as a baseline only; several of their rows are now stale (see §9).

---

## STATUS UPDATE — after the build session (2026-10-19)

The sections below were written at commit `80b907d`, **before** this build session; where they say MISSING, check this table first.

**Evidence from this session (local stack, real PostgreSQL/Redis, mock AI, dev-mock client adapter):** typecheck and lint clean; unit tests 513 passed; integration tests 209 passed (clean runs); end-to-end 283 passed, 2 skipped by design (staging-only specs); `npm audit --omit=dev` 0 vulnerabilities at the time of the dependency fix. **Not verified:** Docker build, GitHub Actions run, backup **restore drill**, load/soak test, any real client platform, any real AI provider.

| CEO brief | Now | What exists / what is still missing |
|---|---|---|
| 1 One platform, six services | **BUILT** | `TenantService` entitlements + industry templates + module registry; several services per client. Modules flagged "planned" are not sold as live. |
| 1A Live chat / support | PARTIAL | + per-client quick replies, articles, instructions by language. Missing: customer/order records via client APIs (needs a real spec). |
| 1B Chat moderation / 1C Community moderation | **BUILT (internal)** | Signed ingest, claim queue, decisions, escalation, warnings/restrictions, appeals, history, per-client categories (`docs/moderation.md`). Missing: sending verdicts back to the client's platform (needs client API); AI assistance. |
| 1D Multilingual | PARTIAL | routing, coverage view, language-specific knowledge. Missing: translation tools, per-language reports. |
| 1E 24/7 coverage | PARTIAL | shifts, absences, handover notes, coverage-gap and "on shift but offline" alerts, SLA reassignment. Missing: assignment driven by the shift plan (touches the protected assignment engine). |
| 1F Dedicated teams | PARTIAL | per-client SLA/capacity/hours/billing/knowledge/approval, tenant isolation. Missing: custom workflow builder. |
| 2 Client setup wizard | **BUILT** | `/admin/clients/new`: company, industry, services, languages, hours, SLA, capacity, billing, operator pay, AI mode, client + staff one-time invitations. Missing: workflow/moderation-rule editor beyond categories and instructions. |
| 3 Operator workspace | PARTIAL | + knowledge panel, training, schedule/handover, reports, moderation, clear status errors. Missing: translation, customer panel from integrations, operator-to-operator transfer screen. |
| 4 Earnings and history | **BUILT** | effective-dated rate cards, per-message payable state, adjustments, payouts, daily/weekly/monthly figures, full history, CEO and manager screens. |
| 5 Manager / supervisor | **BUILT** | planner, reports with feedback, training, QA, alerts, moderation oversight; SUPERVISOR is team-scoped. |
| 6 Client portal | **BUILT** | + invoices, privacy requests, moderation counts, **change requests and a conversation with the account team (notified both ways)**. **live operations view** (queue, team availability by first name, reply-time compliance, no content). |
| 7 Founder dashboard + roles | **BUILT (v2)** | profitability per client, charts, run-rate projection, capacity, obligations, search, widgets, dark mode; SUPERVISOR and CTO roles. Sales pipeline stays in the existing CRM panels. |
| 8 Conversation integrity | VERIFIED (dev-mock) | unchanged; not validated against a real client. |
| 9 Training | **BUILT** | modules, scored tests (answers never leave the server), qualifications, client approval, access gating. |
| 10 AI | PARTIAL | per-client mode (human-only / assisted) enforced for suggestions; **AI + Human is refused until safeguards exist**; mock provider only. |
| 11 Integrations and billing | PARTIAL | pricing per message/ticket/hour/month, immutable invoices, reconciliation. Missing: **fiscal e-invoicing (SDI)**, email/SMS integrations, real client adapter (BLOCKED on a spec). |
| 12 Alerts | PARTIAL+ | + shift coverage alerts and **in-app notifications routed by severity and role** (CEO-configurable; `prisma/ops/alerts-dispatch.ts` every 5 min). Missing: email/SMS/paging channel, error tracking (Sentry). |
| 13 Security and continuity | PARTIAL | + retention windows, data-subject export/erasure, anonymisation (`docs/privacy-and-compliance.md`). Open: restore drill, incident procedure, IP assignment in writing, legal documents. |
| 14 Scalability | PARTIAL | designed for it; **not load-tested** at hundreds of operators. |

**Founder / external items (unchanged, blocked on people, not code):** confirmed registration details for the VAT number (`docs/business-details-and-vat.md` — site, structured data and invoices switch on automatically once filled), the Google Workspace decision and cut-over (`docs/email-google-workspace-plan.md` — no DNS changed), lawyer-reviewed privacy policy / DPA / terms, accountant for SDI.

**Suggested next steps:** (1) a real client API spec → real adapter and verdict callbacks; (2) restore drill + Docker host + first CI run; (3) alert routing and error tracking; (4) legal pack and VAT details; (5) translation and customer-record panel; (6) load test; (7) AI phase with a real key under per-client cost limits.

---

## 1. Fresh evidence gathered this session

| Check | Result |
|---|---|
| `npm run typecheck` | VERIFIED — exit 0 |
| `npm run lint` | VERIFIED — exit 0 |
| `npm test` (unit) | VERIFIED — 34 files, 445 tests passed |
| `npm run test:integration`, Playwright E2E, `npm run build` | **NOT RUN** — local Postgres (`localhost:5432`) is not running in this session |
| `prisma migrate status` | **NOT VERIFIED** — P1001, database unreachable (the register's earlier "VERIFIED" was at an older commit) |
| `npm audit --omit=dev` | **3 vulnerabilities: 1 critical (`next` 16.0.0–16.3.7), 2 high (`sharp`, `source-map-js`)**; `npm audit fix` is offered. This needs action before first paying client (see §8). |
| Docker | `command -v docker` empty → containerised deploy and the staging compose file are **NOT VERIFIED** |
| CI | `.github/workflows/ci.yml` exists; run history **NOT VERIFIED** |
| `.env` | `AI_PROVIDER` set; `OPENAI_API_KEY` empty; `SENTRY_DSN` empty → AI verified for the mock provider only; no error tracking |

## 2. Answers to the CEO's ten questions

1. **Already implemented** — see the table in §3 (core pipeline, RBAC, tenant isolation, SLA/assignment/reassignment, escalations, QA reviews, usage ledger, 2FA, onboarding automation, Hunter CRM, ops alerts, client report, language coverage, staging environment code).
2. **Partial** — operator workspace, manager dashboard, client portal, CEO dashboard, onboarding (Setup Wizard), billing, alerts, tenant configurability.
3. **Missing** — shifts/scheduling/handovers, operator earnings and payment history, training and qualification, knowledge bases, quick replies, translation tools, invoices, weekly operator reports, moderation tooling (content queues, violations, appeals), SMS/email integrations, retention/erasure, error tracking and paging, dark mode and customisable widgets, SUPERVISOR and CTO roles, per-service workspace templates, real AI provider.
4. **Can the architecture carry six services without a rebuild? Yes, with additive work.** The tenant model (one `Tenant`, many `Operator`/`Integration`/`Conversation`) already isolates clients and every pipeline stage is tenant-scoped. Services are not first-class today. Add a `TenantService` (service type, config JSON, rates) and a `Conversation.kind`/`ContentItem` model for moderation. No existing table needs to be replaced.
5. **Do workspaces adapt to industry and services?** Not yet. `ClientOnboarding.requestedProfile` and `Tenant.operatingHours` are JSON and `lib/onboarding/service.ts` automates provisioning, which is the right hook. There is no template/module layer. Staging docs state this plainly ("the operator workspace does not yet change per service type"). Build a template registry (`industry → default modules/queues/dashboards`) driven by data, not per-client code.
6. **Earnings and history?** Yes, buildable on what exists. `UsageRecord` already snapshots `priceEurCents` and `operatorCostEurCents` per message, which gives the audit-friendly "historical rate" property. It is missing: a rate-card table with effective dates, approved/rejected states per message, a payable-message definition, adjustments, a payout ledger and the operator-facing dashboard. No `earning`/`payout` code exists today.
7. **Suitable for AI?** Yes for AI-assisted. `AiGeneration`, `AiMemory`, provider abstraction, input/output caps, limits and content-free failure logging exist and work with the mock provider. Missing for AI + Human: per-tenant AI mode, per-client instructions/knowledge, cost ceilings enforced per tenant, auto-send with handoff rules, a real key. Phase 4 as the CEO sequenced it is right.
8. **Timeline** — §6.
9. **Costs** — §7.
10. **Before the first paying client** — §8.

## 3. Feature status against the CEO's brief

| # | Area | Status | Evidence / gap |
|---|---|---|---|
| 1A | Live chat support | PARTIAL | Messaging, conversations, tickets (`Ticket`, `/api/v1/tickets`), operator send, escalation exist. No quick replies, knowledge base, or customer record/order lookup. |
| 1B | Chat moderation | MISSING | No content queue, approve/reject, violation log. `QaReview` reviews operator replies, not user content. |
| 1C | Community moderation | MISSING | No posts/comments/reports/appeals models. |
| 1D | Multilingual ops | PARTIAL | `Operator.languages`, routing by language, `/operators/language-coverage`. No translation tool, language KBs, or per-language reports. |
| 1E | 24/7 coverage | PARTIAL | Availability status, SLA-based automatic reassignment (capped loop), `needs-attention`. No shift planner, handovers, or coverage alerts. |
| 1F | Dedicated teams | PARTIAL | Tenant isolation, per-tenant SLA/capacity/hours, `OperatorService` for cross-tenant assignment. No per-client KB, workflows or permissions beyond roles. |
| 1 | Multiple services per client | MISSING | No service entitlement model. |
| 2 | Client Setup Wizard | PARTIAL | `ClientOnboarding` + invites + go-live + integration console. No industry/service/rate/AI-mode/billing wizard steps or auto-built workspace. |
| 3 | Operator workspace | PARTIAL | 447-line page; capacity, queue, send, AI suggestion, escalate, `Note`. Reassign exists server-side; operator-to-operator transfer UI is not confirmed. No personal stats, shifts, training. |
| 4 | Earnings and history | MISSING | See §2.6. Message `status/sentAt/deliveredAt` and per-message cost snapshot exist; no approval state or payout ledger. |
| 5 | Manager command center | PARTIAL | `app/manager`, needs-attention, QA queue/summary, ops alerts. No shift/absence mgmt, training, weekly reports. |
| 6 | Client portal | PARTIAL | `client-panel`, `reports/client`, usage summary. No invoices, change requests, account-manager chat, live queues. |
| 7 | Founder dashboard | PARTIAL | CEO dashboard API, Hunter/revenue/commission/fulfillment-cost tables. No profitability per client/service, dark mode, widgets, global search. |
| 7 | Roles | PARTIAL | Enum has `CEO_ADMIN, MANAGER, ASSISTANT, OPERATOR, CLIENT, HUNTER`. **No SUPERVISOR or CTO role.** |
| 8 | Conversation integrity | VERIFIED (dev-mock) | Idempotent webhook ingest, unique `(tenantId, externalMessageId, direction)`, `MessageEvent` trail, `AssignmentHistoryEntry`, retry with backoff and dead-letter E2E (prior session). Not validated against a real client. |
| 9 | Training | MISSING | No schema or code. |
| 10 | AI | PARTIAL | See §2.7. |
| 11 | Integrations and billing | PARTIAL | Generic signed webhook adapter + dev-mock; per-message price/cost ledger. No per-ticket/hour/monthly pricing, invoices, email/SMS, real client adapter (BLOCKED on a client API spec). |
| 12 | Alerts | PARTIAL | `lib/ops/alerts.ts`, `Notification`, system-health. No paging, no severity/role routing, no Sentry (`SENTRY_DSN` empty). |
| 13 | Security / continuity | PARTIAL | RBAC, tenant isolation, audit log, TOTP 2FA with recovery codes, secret guard, safe HTTP, rate limits, disaster-recovery doc. Backup restore drill, load/soak, incident process still NOT VERIFIED. Critical `next` advisory open. |
| 13 | GDPR retention/erasure | MISSING | No purge/anonymise code. |
| 14 | Scalability | PARTIAL | Postgres/Redis/BullMQ, separate realtime server. Not load-tested at hundreds of operators. |

## 4. Architecture decision (CTO recommendation)

Keep the single multi-tenant Next.js + Prisma + BullMQ architecture. Add five additive layers; none touches the core message pipeline:

1. **Service entitlements** — `TenantService { tenantId, serviceType, enabled, config Json }`.
2. **Workspace templates** — data registry: industry → default services, queue definitions, dashboard widgets, SLA defaults, instruction set; applied by the onboarding service, editable afterwards from admin UI.
3. **Work items** — generalise "conversation" with `kind` (CHAT, TICKET, MODERATION_ITEM, COMMUNITY_REPORT) so moderation queues reuse assignment, locking, SLA and QA.
4. **Financial ledger** — `RateCard` (effective-dated), per-message `payableState`, `EarningLine`, `Adjustment`, `Payout`; append-only, corrections as new rows. Reconciles UsageRecord (client billing) with earnings (operator pay) and invoices.
5. **People ops** — `Shift`, `Absence`, `TrainingModule`, `Qualification`, gating operator assignment on qualification.

The sections touching the delivery pipeline need explicit approval per `gco-engineering`'s core boundary.

## 5. Legal, VAT and email items

**International compliance.** Nothing in the repo yet implements it: no privacy policy, DPA template, retention schedule or erasure tooling (the website has no privacy/terms/cookie pages). Engineering can deliver the technical half: configurable retention per tenant, erasure/anonymisation jobs that keep financial records (anonymise the person, keep the ledger), data-subject export, region tags per tenant, subprocessor register, transfer-mechanism fields (SCCs). **The legal texts (privacy policy, DPA, SCCs, retention periods, per-country rules) must be written or reviewed by a qualified lawyer; I am not providing legal advice and nothing here should be published as final.** Data hosting region should be confirmed before the first EU client.

**Italian VAT number.** Waiting for the confirmed details from the CEO (legal name, form, registered address, P.IVA, REA/PEC/SDI code if applicable). Plan: put them in a single source (`lib/content/site.ts`, same pattern as `PUBLIC_EMAIL`), footer/contact/legal pages, invoice and contract templates. Italian invoicing normally requires electronic invoicing (SDI); the invoice module should be built with an accountant's input.

**Google Workspace for `founder@`.** Current state (from `docs/disaster-recovery.md` §5–6): MX points to Zoho EU, SPF is `v=spf1 include:zohomail.eu ~all`, DKIM selector `zmail`, DMARC `p=none`, and `founder@` is today a Zoho mailbox (also the public contact address and DMARC report address). Findings:
- A domain has one active MX set. Two providers can host different users of the same domain only through a split-delivery arrangement, and the *same address* cannot live in both. Running a Zoho company mailbox plus a Google founder mailbox on `globalconversationoperations.com` is therefore possible only with split/dual delivery set up in Google Workspace routing, which is fragile.
- Options: **(A, recommended)** move everything to Google Workspace in one planned cut-over (migrate `founder@` and `mdsohail@`, switch MX, merge SPF to `include:_spf.google.com`, publish a Google DKIM selector, keep `p=none` then tighten DMARC), or **(B)** keep Zoho for all and skip Google, or **(C)** a separate domain/subdomain for Google (not what the CEO asked).
- Whatever is chosen: exactly one SPF record, DKIM published before MX switch, lower TTL beforehand, test SPF/DKIM/DMARC after, keep Zoho active until verified. DNS is at Cloudflare; **I have not changed anything**.
- Needs a decision from the CEO before any DNS change, and the cut-over needs the CEO's admin access.

## 6. Roadmap (status / priority / estimate for one developer plus AI help; estimates are rough, ±40%)

| Phase | Item | Status | Priority | Estimate |
|---|---|---|---|---|
| 0 | Upgrade `next`/`sharp`/`source-map-js` and re-run full suite | MISSING | P0 | 1–2 days |
| 0 | Run integration, E2E, build with DB; restore drill; deploy staging (needs Docker host) | NOT VERIFIED | P0 | 3–5 days |
| 0 | Real client adapter | BLOCKED (client spec) | P0 | 2–4 wks after spec |
| 1 | Tenant services + workspace templates + wizard steps | MISSING | P1 | 3–4 wks |
| 1 | Quick replies, knowledge base, customer info panel | MISSING | P1 | 2–3 wks |
| 1 | SUPERVISOR and CTO roles, team scoping | MISSING | P1 | 1 wk |
| 2 | Earnings ledger, rate cards, operator earnings dashboard | MISSING | P1 | 4–5 wks |
| 2 | Weekly operator reports (auto + manager feedback) | MISSING | P1 | 2 wks |
| 2 | Shifts, absences, handovers, coverage alerts | MISSING | P1 | 4 wks |
| 2 | Training, tests, qualification gating | MISSING | P2 | 3–4 wks |
| 2 | Alert routing by severity/role, paging, Sentry | PARTIAL | P1 | 2 wks |
| 3 | Moderation module (chat + community), appeals | MISSING | P2 | 6–8 wks |
| 3 | Invoices, multi-model pricing, reconciliation | MISSING | P1 | 4–6 wks |
| 3 | Founder dashboard v2 (profitability, widgets, dark mode, search) | PARTIAL | P2 | 4–5 wks |
| 3 | Client portal v2 (live view, invoices, requests) | PARTIAL | P2 | 3–4 wks |
| 3 | GDPR tooling (retention, erasure, export) | MISSING | P0 before EU clients | 3 wks + legal review |
| 3 | Email/SMS integrations | MISSING | P3 | 2–3 wks each |
| 4 | AI modes (assisted → hybrid), per-client instructions, cost caps | PARTIAL | P3 | 8–12 wks |

Rough total to the CEO's full vision: 9–12 months of focused work. Phases 0–1 plus GDPR and the earnings ledger are the minimum for a first paying client.

## 7. Cost expectations (order of magnitude, to be confirmed with quotes)

- Hosting: current single 8 GB server is enough for a pilot; add a separate staging server (~€10–20/mo) and managed Postgres/backups before scale.
- Google Workspace per user per month if option A; Zoho is currently on the free plan.
- Error tracking (Sentry) free to low tier; uptime/paging service low tier.
- OpenAI usage: per-token; cap per tenant before enabling. Translation/moderation APIs similar.
- SMS/email providers: per-message.
- Legal review (privacy policy, DPA, contracts): one-off professional fees; accountant for e-invoicing.
- Load/soak testing needs a production-like environment.

## 8. Before the first paying client (priority order)

1. Upgrade the vulnerable dependencies and re-run all suites (including E2E against a DB).
2. Real client adapter against an actual spec/sandbox; reconcile billing on it.
3. Backup restore drill, staging deployed and walked through, basic alerting/Sentry.
4. Retention/erasure and the legal pack reviewed by a lawyer; VAT details on site/invoices.
5. Earnings ledger and invoices (operators and client must trust the numbers).
6. Contract/IP: confirm software ownership and source-code rights in writing (the GitHub repo is on a personal account and the DR doc flags a single-owner risk).

## 9. Corrections to older documents

`GCO_PRODUCTION_GAP_REGISTER.md` (at `6ffc8d5`) is behind HEAD: 2FA, staff account tooling, client onboarding, the Hunter CRM and a live production server (Cloudflare + Caddy + Zoho) now exist. It should be re-baselined once the checks that are NOT VERIFIED here are run.

## 10. Status of items the CEO asked about earlier

- **CRM screenshots:** DONE for fictional demo data — captured operator, queue, supervisor, quality and language-coverage screens and a captioned video are in `deliverables/inside-gco/` and published as the Inside GCO page (`9bbbcca`). Staging screenshots (`deliverables/staging/admin.png`, `simulator.png`) exist.
- **Staging walkthrough:** BUILT, **not deployed**. Verified locally by the previous session's tests; the compose file has never been run (no Docker). Rollout needs DNS, a Caddy block with an access gate, and the CEO's approval.
- **Initial security assessment:** this document gives the dependency and platform view only. A full threat review (`gco-security-review`) and an external penetration test have **not** been done in this pass. Known open item: critical `next` advisory.
