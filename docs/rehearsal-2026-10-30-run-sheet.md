# Internal CRM rehearsal — Friday 30 Oct 2026, 17:00 CET (CEO and CTO)

Local demo copy only. Fictional data, simulated client, **AI off**. Never production. Companion to `docs/sales-demo-script.md` (the six-minute external script); this is the longer internal review the CEO asked for, covering his points 1–10 of section 21.

## Setup (done 30 Oct, local)
- A **separate clean database** (`gco_demo`, own Redis db 1) holds only the demo: 2 fictional clients, 4 operators, a manager, a hunter, a founder-role demo account. The normal test database had 90 leftover test tenants that would have cluttered the Founder view, so it is not used.
- Start: `~/gco-local/start-demo.sh` (web on `http://localhost:3100`). Health must show `ai: disabled`. Simulated customer message: `~/gco-local/inject-demo.sh "<name>" "<text>" [lang]`.
- Accounts (password in `prisma/seed.ts`, local only): `admin@demo.gco` (Founder role, CEO_ADMIN), `manager@demo.gco`, `operator1@demo.gco`, `client@demo.gco` (Everline Retail), `client2@demo.gco` (Northbay Travel), `hunter1@demo.gco`. Note: this local founder account is a demo account; the CEO's real production account is separate.
- Operator must be set **Available** before a message is injected (done in the pre-check).
- If base seeding is ever repeated: `npm run seed` finishes its work but the process does not exit; stop it with Ctrl+C after the line "Demo conversation webhook event … processed: true" (this explains the earlier "hang").

## Pre-check result (30 Oct, API level, clean demo database)
Founder totals: 2 clients, 4 operators. Simulated message → assigned automatically to the available operator → operator reply accepted → appears in the manager's QA queue (4 items). Client 1 report shows 8 conversations in 14 days, client 2 shows 2 (separated). The operator and the hunter get **403** on the Founder overview. A client requesting another client's conversation by ID gets 404, but my check of the same read by its own owner also returned 404 (wrong endpoint), so only the list-level separation is verified here; automated spec `05` is the isolation proof.

## Run order (about 45 minutes)

| # | CEO point | What we do | What we say |
|---|---|---|---|
| 1 | Founder account and permissions | Log in as `admin@demo.gco`; show executive overview, clients, billing, earnings, approvals, integrations, privacy. Show what the operator and hunter cannot open (403). | Highest business role today; roles are fixed in code; no role-assignment screen yet (roadmap). |
| 2–4 | Operator, Manager, Client accounts | One browser profile each, already signed in. | Each role sees only its own work. |
| 5 | Complete simulated conversation | Inject a message; operator receives it assigned; reply; mark resolved. | "Replies are written by a person. AI is off." |
| 6 | Assignment, delivery, QA, escalation | Show assignment and capacity; reply delivery status (stored; not shown per message in the thread yet); manager QA review with a score; operator escalates, manager claims it; client sees the decision request. | |
| 7 | Integration status and readiness | Founder → integrations/onboarding console: go-live checklist (11 items), dev-mock vs real webhook connector. | Only the generic signed webhook connector exists; Zendesk/Gorgias/Intercom/Shopify are not built. A client is never live just because an integration is configured. |
| 8 | Billing and reporting on test data | Billing settings, an invoice (draft → issue), reconciliation, executive margin; client report; operator earnings page. | Invoice page is a print view, **not** a tax invoice; GCO legal details are placeholders. |
| 9 | What can be downloaded | State plainly: **nothing is exportable yet** (no CSV, Excel or server PDF). Only the invoice print page and on-screen reports. | Roadmap P0: CSV exports and invoice PDF. |
| 10 | Gaps | Walk `docs/readiness/30-feature-inventory-and-roadmap-2026-10.md` section 1 and the decisions list. | |

Fictional **Hunter** exists (pipeline, claim, approval). **Broker and HR/recruiter accounts do not exist yet.**

## Things not to show or say
No production data or addresses on screen; no earnings screens of real people; no prices, dates or compliance claims; no promise on delivery or integrations before the joint feasibility review.

## After the rehearsal
Reset for the external demo: `npx tsx prisma/demo-showcase.ts --reset` with `~/gco-local/env-demo.sh` loaded, then restart `~/gco-local/start-demo.sh`.
