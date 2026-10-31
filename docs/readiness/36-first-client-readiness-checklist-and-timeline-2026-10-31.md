# 36 — First-client readiness checklist with evidence, external needs and timeline (31 Oct 2026)

Answers the CEO's requests of 30–31 Oct (Norforst feedback): what is complete, what is missing, which documents we can prepare internally, what needs external legal or security expertise, and a realistic timeline. **Staging and documentation only; no production deployment, real client data access or paid service is authorised.** Nothing here is a compliance or certification claim.

## 1. P0 checklist (the seven items the CEO named, plus the rest of the P0 list)

Status: **Done** = evidence exists. **Partial** = some evidence, gap named. **Open** = not done. Evidence dates are 29–31 Oct 2026 unless stated.

| # | Item | Status | Evidence | Outstanding | Needs |
|---|---|---|---|---|---|
| 1a | Backup: daily, integrity-checked, restore proven | **Done** (local) | Nightly timer; `pg_restore --list` check in script; 29 Oct dump restored into a throwaway database (16 migrations, 7 users, counts equal, 0 warnings); full rollback rehearsed twice in isolation (`28` §12–13, `29` §F) | Repeat restore drill monthly; automate it | none |
| 1b | Backup: restricted offsite key (upload-only) | **Open** | Current key can delete offsite files (finding B-1, `05-security-controls`); steps sent to the CEO | Key created via the B2 command line, installed, one nightly upload verified, old key retired last | CEO / Backblaze account owner |
| 1c | Backup: encryption before upload | **Open** | Optional age encryption ships in the release script; **recipients file absent on the server**, so dumps are plain (only Backblaze's own storage encryption applies [confirm]) | CEO creates two age key pairs, sends public keys, keys installed, restore from an encrypted copy proven by the CEO | CEO |
| 1d | Backup: **offsite restore** verified | **Open** | Offsite upload is verified nightly (log, 24–29 Oct); no restore *from* Backblaze yet | Download newest offsite dump with a separate read key, restore into a throwaway database | CEO read key; CTO |
| 1e | Backup: retention (30 days) and failure alert | **Open** | Local dumps pruned after 14 days; offsite has no expiry; failures only logged (no alert) | Lifecycle rule on the bucket; alert on failed backup/upload | CEO approval of the rule; small build |
| 2 | Two-factor mandatory for Founder and CTO, with recovery | **Partial** | Implemented and tested (authenticator app, single-use recovery codes, replay protection; unit `totp`, integration `twoFactor`, E2E `35`); enforcement is a setting, off by default; CEO's account has it off; recovery procedure documented (`26`); **local rehearsal 31 Oct passed** (enrolment, enforced sign-in, wrong/correct code, recovery code single use; see `26` §7) | Run the reset tool and the enforced sign-in **on the staging server**; create a CTO account (none exists in production), enrol it, then enable for CEO_ADMIN and CTO | CEO enrols first; separate production approval |
| 3 | Client data isolation and access-control tests | **Partial** | E2E `05`, `06`, `20`, `39`–`51`, unit `tenantGuard`, `rbac`, `apiRouteAccessChecks`; full suite passed 29 Oct (E2E 297); demo check 30 Oct: client 1 sees 8 conversations, client 2 sees 2, operator and hunter refused on founder routes | **Per-field leak test** for every client-visible response (P0-9) | build (S) |
| 4a | Verified integration (signed webhook both ways) | **Partial** | Signing, replay window, dedup, ping, outbound delivery with retry, verify route: unit `gcoWebhookAdapter`, integration `gcoWebhookDelivery`, E2E `25`, `27`; **only against a simulator** | Real client sandbox and feasibility check; sandbox/production field and stored verification results (P0-5) | first client's platform |
| 4b | Reliable message-delivery status shown | **Open** | Status stored per message; the operator thread does not show it | Show pending/sent/delivered/failed per reply (P0-8) | build (S) |
| 5a | Pilot-size load test | **Open** | Only a development-laptop run: 1,000 msg/min for 3 min, 3,000/3,000 stored, ack p99 31 ms (19 Oct); not production-like | Test on a production-like staging server with concurrent operators, bursts and retries | A **separate test server** (cost to quote): load-testing on the production host is unsafe |
| 5b | Monitoring and outage alerts | **Open** | Health endpoint exists; UptimeRobot "configured but unverified"; nothing alerts a person | Verified uptime monitor and alert to Founder and CTO; backup-failure alert | CEO approval if paid; free tier first |
| 6a | Accurate billing records | **Done** (release-ready) | `billingCalc` unit, `billingInvoices` and `earningsLedger` integration; reconciliation checked 30 Oct on demo data (billed, invoiced, operator cost, margin consistent; invoice number `GCO-2026-0001` issued) | GCO legal and billing details are **placeholders** (`lib/config/business.ts`) | CEO/accountant |
| 6b | Operator-payment and billing exports | **Open** | No export of any kind exists | CSV (audited, expiring links) for usage, invoices, reconciliation, operator earnings (P0-7) | build (M) |
| 7 | Demo accounts disabled before production | **Open** | Tool exists (`prisma/ops/disable-demo-accounts.ts`) with a dry-run mode and a check that a real replacement CEO_ADMIN exists; 5 `@demo.gco` accounts exist on production (read-only check 29 Oct) | Dry run on staging, then production run | separate production approval |
| 8 | Release of the pending version (billing, shifts, training, knowledge, moderation, privacy tools, headers) | **Prepared, on hold** | Tests, backup, rollback x2, runbook (`33`), recommendation (`32`) | CEO written approval | CEO |
| 9 | AI disabled by default | **Done** | Master switch must equal `enabled`; pinned `disabled` in compose; unit `aiMasterSwitch`, integration `aiDisabled`, E2E `01b`, `52`; live health reports AI status; zero OpenAI use to be confirmed against the CEO's baseline | Remove the OpenAI key after release (approval) | CEO |
| 10 | Which CRM functions are production-ready | **Done** (documented) | Brief labels each capability live / release-ready / needs development (`technical-security-pack/partner-capability-brief.md`) | Re-label after the release | — |

## 2. Third-party security testing (CEO point 3)
- **Status: not done.** No independent penetration test or audit has been performed. What exists: an internal, OWASP-ASVS-aligned self-assessment (`19`), automated tests, and a dependency audit with 0 production vulnerabilities on 20 Oct. **None of these may be described as independent testing.**
- **Proposal:** obtain two or three written quotes for an independent web-application and API test, run against **staging with fictional data** (scope: authentication, tenant isolation, webhooks, admin routes, exports); retest after fixes. Cost and lead time are unknown until quoted, so none is assumed here. Decision for the CEO: run the first pilot with a disclosed "not yet independently tested" status, or wait for the test; I recommend disclosing plainly and completing the test before adding further clients.

## 3. Documents we can prepare internally (status)
| Document | State |
|---|---|
| Security page claim verification and revised wording | **Done** (`35`; not applied to the website) |
| DPA technical annex (technical and organisational measures, sub-processors, transfers, retention and deletion, incident response) | **Draft written** (`technical-security-pack/12-dpa-technical-annex-DRAFT.md`) |
| Public technical privacy information (draft text) | **Draft written** (same file, Part B) |
| Architecture, security controls, data lifecycle, reliability, third parties | Exist (`technical-security-pack/01`–`11`); refresh after the release |
| Record of processing, breach procedure, retention schedule | Drafts exist (`legal-drafts/05`, `07`, `09`); technical facts to be re-checked against the annex |
| Partner-ready security pack | Partner capability brief + annex + checklist form the pack; assemble after legal review of the wording |
| Pilot cost and capacity estimate | **Draft written** (`37`) |

## 4. What requires external legal or specialist expertise
1. **Legal entity and company details** for the website, contracts and privacy notice (CEO).
2. **DPA text** (adopt the Commission's controller–processor standard clauses; fill the annexes), privacy notice, record of processing: lawyer review. Drafts note that the official clause numbering was not verifiable from the CTO's side.
3. **International transfers and access from outside the EU/EEA** (the CTO's access from India; Cloudflare, Backblaze and any US-group provider): transfer assessment and safeguards. Until then no real client personal data is accessed from India.
4. **Partner and commission agreements** (hunter, broker, subcontractor, HR sourcing): legal review before any commitment or implementation.
5. **Tax and accounting:** e-invoicing route and retention periods (accountant).
6. **Independent security test** (section 2).
7. **Data-protection impact assessment and any data protection officer question**: lawyer's view, depending on the client's data.

## 5. Realistic timeline (technical work only)
Assumes the CEO approves starting, one engineer (the CTO), staging first. Durations are working-day estimates, not commitments; external items are listed separately because their lead times are unknown.

| Block | Work | Estimate |
|---|---|---|
| A | Documentation round (annex, pack refresh, wording) | 2–3 days (mostly drafted) |
| B | Staging rehearsals: two-factor recovery, backup encryption with test keys, demo-account disable dry run | 2–3 days |
| C | P0 builds: environment field and stored verification (S), per-reply delivery status (S), per-field leak tests (S), backup-failure alert (S), CSV export service with audit and expiring links (M) | about 2.5–3.5 weeks |
| D | Pilot-size load test on a separate test server, monitoring set up | about 1 week (needs the server cost approved) |
| E | Release approval, window, post-release verification | 1 day plus the window |
| F | Production steps (two-factor enforcement, demo accounts off, key and encryption set-up, offsite restore proof) | 2–3 days, each step separately approved |

**Technical critical path: about 4–5 weeks from the day building is approved** (best case about 3 weeks with no defects and immediate approvals). The earlier mid-November target for a first client is therefore **at risk**; a pilot start in the **last week of November to early December** is realistic if the external items below do not slip. The earlier the CEO approves the P0 list and the test server, the earlier this moves.

**External items on the critical path (outside the CTO's control):** legal review of the DPA and pilot agreement; the CEO's Backblaze key and age keys (hours of work, but they depend on the CEO's time); the client's platform feasibility and sandbox; independent test (if required before the pilot); the transfer assessment for access from India (or naming an EU-based administrator).

## 6. Decisions needed
1. Approve starting the P0 builds on staging (list in `34`) and a temporary separate test server for the load test (cost breakdown to follow before purchase).
2. Backblaze key and age keys: when the CEO can do them.
3. Pilot with disclosed "not independently tested", or wait for the test.
4. Which website wording changes to approve (`35`); they ship only with a release.
5. Whether to name an EU-based administrator or obtain the transfer assessment for access from India.
