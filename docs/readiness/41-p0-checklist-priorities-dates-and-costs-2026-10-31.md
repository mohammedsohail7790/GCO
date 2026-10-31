# 41 — Prioritised P0 checklist with estimated dates, dependencies and costs for approval (31 Oct 2026)

Basis: CEO approval of 31 Oct to begin the P0 development on **staging**; production unchanged; any production deployment, paid service or infrastructure purchase needs separate written approval. Target for the first pilot: last week of November or early December, subject to readiness.

**How to read the dates.** All dates are **estimates, not commitments**, assuming one engineer (the CTO), work starting **Monday 2 Nov**, no major defects, and the CEO's inputs arriving when listed. Estimates for external items (legal, independent test, client sandbox, keys) are not mine to give and are shown as "set by others". Priority 1 = needed before real client data; 2 = needed before the pilot goes live with real traffic but can overlap; 3 = follows after launch with a documented workaround.

**Branching rule.** New P0 code lives on branch `p0/first-client-readiness`, separate from the release-candidate branch, so the release plan's "no application code after `ec59f38`" condition is not disturbed. All of it is tested locally and on staging before any production proposal.

| # | Pri | Item | Effort | Estimated finish | Depends on | Cost needing approval | Evidence of done |
|---|---|---|---|---|---|---|---|
| 1 | 1 | **Delivery status per reply** shown in the operator thread (pending, sent, delivered, failed) | S | Tue 3 Nov | none | none | Failed delivery visible within seconds in a test; automated test |
| 2 | 1 | **Client-portal leak tests** (no margins, operator pay, commissions, sales data or other clients' data in any client-visible response) | S | Thu 5 Nov | none | none | Test fails if a forbidden field appears in any client-role response |
| 3 | 1 | **Two-factor enforced sign-in regression test** (+ staging rehearsal incl. reset tool) | S | Fri 6 Nov | none; local rehearsal done 31 Oct | none | Automated test for the enforced path; staging run recorded |
| 4 | 1 | **Integration environment field and stored verification results** (sandbox vs production; a dev simulation can never be Live) | S–M | Wed 11 Nov | additive migration | none | Dev-mock cannot reach Live; verification history visible; audit entry on change |
| 5 | 1 | **Backup failure alert and verified uptime monitor** (email to Founder and CTO) | S | Fri 13 Nov | an email sender for alerts (see costs) | possible: alert email sender; monitor paid plan only if the free tier is insufficient | Stopped service and failed backup each produce an alert within minutes on staging |
| 6 | 1 | **CSV export service** (usage, invoices, reconciliation, operator earnings): role-checked filters, audit entry per export, expiring links, retention limit | M | Mon 23 Nov | #2 patterns; permissions | none | No-permission user refused; other user's link fails; expiry works; file purge works; totals equal the screen |
| 7 | 1 | **Production-like load test at pilot size** on a separate test server, with concurrent operators, bursts, outbound retries; monitoring set up | M | Fri 27 Nov | #5; **test server approved** | **Temporary test server** (hourly Hetzner server of the production type; derived from the CEO-confirmed monthly price a two-day test is a few euros; **quote before purchase**) | Written results: rates, latency, errors, resource use, first bottleneck |
| 8 | 1 | **Billing details and first-invoice figures**: real GCO legal and billing details replace placeholders; reconciliation for the first period | S (GCO side: supply details) | **set by CEO/accountant**; code part 1 day after details arrive | CEO/accountant | none | First invoice figures reconcile to the cent; legal invoice issued by the accountant |
| 9 | 1 | **Backup keys**: restricted Backblaze key, age public keys installed, lifecycle rule, offsite restore proven | S (CTO) | **set by CEO** (steps in `38`); CTO 1–2 days after keys arrive | CEO creates keys; **install `age` on the server before the recipients file (server change, needs approval)** | none | Key check clean; one nightly upload; encrypted dump decrypted by the CEO and restored with correct counts |
| 10 | 1 | **Mandatory two-factor for Founder and CTO** (create CTO account, enrol both, then enforce) | S | after #3 and production approval | CEO enrols first; separate production approval | none | Unenrolled privileged account refused, enrolled signs in; recovery tested |
| 11 | 1 | **Demo accounts switched off on production** | S | after #10 and production approval | a verified real CEO login | none | Demo accounts cannot sign in; audit entry |
| 12 | 1 | **Release of the pending version** (+ the P0 builds, one combined release proposed to avoid two risky events) | window | proposed window **Sat 28 Nov or Sun 29 Nov**, only if #1–#9 are done | CEO written approval; go/no-go refreshed (`32`, `33`) | none | Runbook steps; smoke test; rollback ready |
| 13 | 2 | **Independent security test** (quotes, then test and retest) | external | quotes by about 6 Nov if requests go out Mon 2 Nov; test date **set by the vendor** | CEO approves vendors and the cost (`40`) | **Test fee: unknown until quoted** | Report and attestation letter; findings fixed and retested |
| 14 | 2 | **Legal documents** (DPA text, privacy notice, pilot agreement, transfer assessment, partner and HR terms) | external | **set by the CEO's lawyer** | CEO arranges | **Legal fees: CEO** | Reviewed documents signed or approved |
| 15 | 2 | **First client's integration feasibility and sandbox** | M (per platform) | **set by the client** | client brief and access | possible client-platform licence | Feasibility note approved; sandbox verification passes |
| 16 | 3 | Contract profile and 16-milestone tracker; invoice PDF and payment record; per-client integration health page; richer exports | M–L | after launch (workaround in `34`) | #6, #4 | none | Per `31` |

## Critical path and the pilot date
Technical items #1–#7 take about **four weeks** (to Fri 27 Nov). Items #8–#11 depend on the CEO's inputs and approvals and can run in parallel. The combined release window would then be **Sat 28 or Sun 29 Nov** at the earliest, followed by production steps #10–#11 and the offsite restore proof, so a **first pilot start in the first week of December is realistic; the last week of November is possible only if every CEO input arrives early, the load test finds no problem and the release goes in the first window.** The independent test (#13) and legal review (#14) are outside this path and decide whether the pilot starts with the "not yet independently tested" disclosure.

## Costs needing approval (nothing is purchased)
| Item | Needed for | Estimate | Needed by |
|---|---|---|---|
| Temporary test server for the load test (#7) | Safe production-like test | a few euros for two days, derived from the confirmed monthly price; **written quote first** | Mon 23 Nov |
| Alert email sender (#5) | Backup and outage alerts reach a person | Probably nothing extra if a company mailbox is used; **a Workspace configuration the CEO must approve** | Mon 9 Nov |
| Paid uptime monitoring (#5) | Only if the free tier is insufficient | unknown; free tier first | decide after trial |
| Independent security test (#13) | Partner and client expectation | unknown until quoted | quotes from about 6 Nov |
| Legal review, accountant (#14, #8) | Contracts, privacy, invoicing | CEO | CEO's timetable |

## Dependencies on the CEO (in order of urgency)
1. Backblaze key and age public keys (`38`): needed for #9; the earlier they arrive the earlier the offsite restore is proven.
2. Legal entity and billing details (#8).
3. Approval of the test-server quote (#7), the alert email route (#5) and the security-test vendors (#13).
4. Pilot inputs for the cost worksheet (hours, pay basis, pricing model).
5. Enrolment of his own two-step login on staging before production enforcement (#10).

## Progress log (branch `p0/first-client-readiness`; local and staging-style only, production untouched)
**31 Oct 2026 (ahead of the estimates above):**
- **#1 Delivery status: built and tested.** Finding: a conversation leaves the operator's screen as soon as it is answered, so a status label on the thread alone would never be seen. The workspace now also returns the operator's own replies of the last 24 hours with their delivery state, and the operator page shows a "Recently sent" panel (Delivered, Sending..., or "Not delivered - tell your supervisor" with a red banner). No failure detail is exposed. Evidence: unit test `deliveryStatus` (4), E2E `55-operator-recent-replies` (2: delivered then failed shown; other operators and replies older than 24 hours excluded), checked in the browser on the demo stack in both the delivered and failed states.
- **#2 Leak tests: built and tested.** E2E `54-client-portal-leak` seeds two clients with billing settings, usage, an operator reply and an issued invoice, then calls every client-reachable GET endpoint (15 candidates; at least 6 must answer or the test fails) and fails if any response contains a forbidden internal key (margin, operator cost, rates, commission, payout, ledger, secrets, two-factor fields, hunter), the other client's identifiers or marker text, or either client's staff emails. A second test shows management data does exist and clients are refused the management routes. Negative control: the same key filter flags `marginEurCents`, `operatorCostEurCents`, `payout...` on the management overview. Passed.
- **#3 Two-factor enforced sign-in: regression test built.** Integration `twoFactorEnforcedLogin` (5 tests) drives the real login route: default off; enforced listed roles refused with the right password and audited; wrong password reveals nothing; unlisted roles unaffected; enrolled accounts need a code, recovery code works once. Passed. Staging-server run of the reset tool still to do.
- **Regression checks:** typecheck and lint clean; unit 734/734; integration 224/224 on two clean runs, with **one intermittent failure in one earlier full run** (`earningsLedger`: concurrent payout test, passed alone and on both reruns; to be investigated, not related to these changes); 30 related E2E specs passed.
- **Not yet committed.** The branch work is uncommitted pending the CTO's instruction.
