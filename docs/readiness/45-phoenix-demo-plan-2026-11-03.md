# 45 — Phoenix S.r.l. CRM demo: plan, status labels and presentation advice (3 Nov 2026)

**Context.** The CEO met Phoenix S.r.l. on 3 Nov (11:00 CET). Positive; Phoenix might send GCO projects or outsource part of its workload; interest in flexible pricing; **no project, price or agreement confirmed**; they want to see the CRM. **Nothing may be promised: production readiness, specific integrations, staffing capacity, launch dates, prices.**

**Environment.** The demo runs on the **clean demo copy on the CTO's computer** (fictional data only, AI off, own database; health page confirms AI disabled). It is the release candidate plus the P0 branch, so it is **newer than production**. It is not the hosted staging server (a hosted copy would need a separate server and cost; not requested). Reset and rehearsed 3 Nov 2026: reset ran; an Italian message queued (no Italian-speaking operator in the demo set) and an English message was assigned within seconds; all role pages load. Not yet rehearsed with the CEO, and the visual walkthrough of every screen in a browser is still to be done on the day before.

## Status labels (how every feature is called out)
**LIVE** = running in production today. **BUILT** = built and internally tested, not yet released to production. **PLANNED** = not built. These labels were checked on 4 Nov against production's public routes (unauthenticated, read-only): see `46`. That check shows which features exist in production, not which commit or migrations are deployed.

| Phoenix wants to see | What I show | Status |
|---|---|---|
| Multi-client workspace and client separation | Two fictional clients (Everline Retail, Northbay Travel): the manager view per client; `client@` and `client2@` in side-by-side windows see only their own data. Admin client list (no billing) | Separation **LIVE** (automatic leak tests exist); onboarding console **LIVE**; client creation wizard **BUILT** |
| How conversations enter | Simulator sends a message through the signed webhook; it appears queued/assigned; the reply goes back to the client's callback address | Inbound/outbound signed webhook **LIVE** (simulator only, no real client connected); delivery status shown to the operator and **integration environment (sandbox/production) and check history: BUILT** |
| Queues, language routing, assignment | Italian message waits (no Italian operator in the demo set), English assigned; manager sees coverage and the retry every 15 seconds | **LIVE** |
| Operator workspace and replies | Operator view: write, send, resolve, quick replies/knowledge, escalate/transfer, handover note | Core **LIVE**; transfer, knowledge, training and moderation **BUILT** |
| Shifts, team management, supervisor controls | Shift plan, absences, capacity setting, coverage; manager reassign/transfer | Shifts and absences **BUILT**; coverage and assignment **LIVE** |
| QA, escalations, SLA monitoring | Supervisor scores a reply (accuracy, tone, resolution); "needs attention" list after repeated missed deadlines; escalations | QA and response-deadline control **LIVE**; configurable scorecards, appeals, client-specific SLA reports **PLANNED** |
| Client dashboards, reporting, usage | Client view: own conversations, usage, performance; usage is counted per message | On-screen view and usage counting **LIVE**; client invoices list **BUILT**; downloadable reports and client exports **PLANNED** (an admin-only CSV export is **BUILT**) |
| Integrations, API, webhooks | Explain the signed webhook, replay protection, duplicate handling, test mode and the go-live checklist | Generic webhook **LIVE**; **no** native WhatsApp, Meta, Shopify, Zendesk, Gorgias, Intercom or other connectors (**PLANNED, per client**); no general public API beyond the webhook and callback |

**Do not show:** billing, earnings, the Hunter pipeline, margins, any real or admin credential, production, any password. Do not name prices or SLA figures. The earnings and billing screens exist; showing them would expose how GCO pays and charges.

## Run sheet (about 15 minutes of demo inside a 45-minute meeting)
1. **2 min, framing (CEO):** GCO is a digital BPO with its own platform. A person writes every reply; AI is off. This is a test copy with fictional data; some screens are not yet in production, and I will say which.
2. **2 min, two clients and separation:** show both client windows; point out they cannot see each other.
3. **2 min, entry:** send an English message; show it queue, assign, and appear for the operator.
4. **2 min, language routing:** send the Italian message; it waits; the manager sees the coverage gap. "This is how we know we need an Italian operator on shift before we accept Italian work": a statement about staffing, **not** a capacity promise.
5. **3 min, operator and manager:** reply, resolve, escalate; shifts, capacity, reassignment.
6. **2 min, QA and deadlines:** score a reply; the "needs attention" list.
7. **1 min, client reporting and usage.**
8. **1 min, integrations:** the signed webhook and the integration console (sandbox first; a simulation can never go live).
9. **Then 25+ minutes: their workload** (see questions).

## Questions to ask Phoenix (so the demo becomes a scoping conversation)
Which client queues or projects might they outsource; languages and volumes; channels and tools (their helpdesk/CRM and whether it has an API); covered hours and peaks; quality and reporting they need; data-protection terms they expect; who would be the day-to-day contact. Ask for the API documentation and a sandbox, and say GCO will answer "simple / moderate / complex" before committing.

## What to say if asked
- **Production-ready?** "The platform is built and tested; the first client pilot is being prepared. We will confirm readiness for your workload after reviewing your requirements."
- **Which integrations?** "A signed webhook is built and tested against a simulator. Specific tools are scoped per client."
- **How many operators / languages?** "We size staffing to a defined workload; I will not quote capacity before we know the volumes and languages."
- **Price?** "Usage-based pricing is the structure we are considering; numbers come after scoping and are not agreed in this meeting."
- **Security?** Roles, separation, audit trail, encrypted connections, hosting in Germany, backups. No certification, no independent test yet (planned), two-step sign-in available but not yet required for all privileged accounts.
- **Any contract/commission/subcontracting terms?** "Handled in writing after review."

## Before the call (the day before and 15 minutes before)
`bash ~/gco-local/start-demo.sh`; `npx tsx prisma/demo-showcase.ts --reset`; check health reports AI disabled; log each role into its own window (no password typed on screen); send and discard a test message; close terminals, notifications and anything showing credentials or server names.
