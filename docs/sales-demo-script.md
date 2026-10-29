# GCO CRM Demo Script — six minutes

**Replaces** the earlier live-on-production script (retired: it showed production, a Hunter sales pipeline and AI wording that no longer apply). Matches the run sheet of 27 Oct 2026.

**First use:** Silver Bell Group, Tue 3 Nov 2026, 13:00 CET (about 6 minutes inside a 25-minute meeting). Internal rehearsal with the CEO: Fri 30 Oct, 17:00 CET.

## Rules (CEO, binding)
- Fictional data only, on the **local or staging copy**. **Never production.** A simulated client sends the messages; no real client is connected.
- **AI is off.** Say plainly that every reply is written and sent by a person. Never claim AI replies.
- Do not show billing, earnings (the "Earnings" link on the manager and operator pages), the admin console or the Hunter/sales pipeline. Do not quote prices, dates, SLA figures or "our clients". No compliance claims.
- No promises on delivery capacity or integrations: "I will confirm after reviewing your requirements." Feasibility is reviewed together with the CEO.
- The demo runs on the release candidate, which is newer than what is deployed today. Say so if asked.

## Before the call (15 minutes before, every time)
1. Start the AI-off local stack (web on port 3100, worker, realtime). Check `http://localhost:3100/api/v1/health` reports `"ai":{"enabled":false,"mode":"disabled"}`.
2. Demo data present: `npx tsx prisma/demo-showcase.ts` (idempotent; it also creates the second client). To start clean add `--reset`.
3. Accounts (password in `prisma/seed.ts`, local only; do not show it on screen): `operator1@demo.gco`, `manager@demo.gco`, `client@demo.gco` (Everline Retail Co) and `client2@demo.gco` (Northbay Travel). Open each in a separate browser profile or window, already logged in, so no login is typed live.
4. Open the simulator ready to send: `~/gco-local/inject.sh "<name>" "<text>" [lang]`.
5. Close everything else: no terminal with secrets, no `.env`, no server addresses on screen. Do not use a screen that shows notifications.
6. Do a silent dry run of the first message; confirm it is assigned within a few seconds, then reset or use a new name.

## Run sheet

| Min | Show | Say | Real today |
|---|---|---|---|
| 0:00 | Send a message with the simulator; open the operator view, where it arrives already assigned | "Clients connect through a signed HTTPS interface. This client is simulated; no real client is connected yet. The message was queued and assigned automatically." | Works (simulator) |
| 1:00 | Manager view: queue, available and busy operators, language coverage | "Assignment respects each operator's capacity (default two at a time) and language, and prefers operators on shift. If nobody is free it retries every 15 seconds." | Works |
| 2:00 | Operator view: write a reply, send, mark resolved; shift plan and absences | "Every reply is written by a person. AI is off." | Works |
| 3:00 | Supervisor (manager) QA review: score accuracy, tone, resolution on a real reply | "Quality is scored by supervisors on real replies." | Works |
| 4:00 | Manager "needs attention" list: conversations stopped after repeated missed deadlines, Resume / reassign (prepared data) | "After repeated missed response deadlines automatic reassignment stops and a manager is alerted. The limit is configurable." (Say "five" only if asked; do not present it as an SLA promise.) | Works |
| 4:45 | Client view as `client@demo.gco`: own conversations, usage, reporting. Then `client2@demo.gco` in the other window: different data | "Each client sees only its own data. The two clients are separate fictional accounts." | Works (second client in demo seed) |
| 5:30 | Close on one slide or the login page | "The platform is built. Connecting a specific channel (WhatsApp, Meta, Shopify and so on) is a per-client integration against their access; we scope that together first." | Say plainly |

## If something goes wrong
- Message not assigned: check that all three services run (health page shows database and redis up); worker log `~/gco-local/worker.log`. Say "this is a local copy" and show the queue from the manager view instead.
- Do not improvise on production. Do not switch to a different environment live.

## Questions to answer carefully
- "Is AI used?" — "No. Replies are written by trained operators. We may evaluate assisted drafting later; it is off."
- "Which platforms do you integrate with?" — "A signed webhook interface is built and tested with a simulator. Specific platforms are scoped per client; I will confirm after reviewing your requirements."
- "Security and data location?" — Hosting is in Germany (per our docs); two-factor is available for staff accounts; do not make certification claims. Refer to the technical brief.
- Volumes, languages, coverage hours, prices, start dates: "I will confirm after reviewing your requirements together with our CEO."

## Meeting agenda (proposed for Silver Bell, 13:00 CET)
0–5 min: CEO introduction. 5–10 min: platform and integration approach (CTO). 10–16 min: CRM demo (this script). 16–25 min: their requirements and feasibility.

## Verified on 29 Oct 2026 (local, AI off)
Health reports AI disabled; manager dashboard shows the needs-attention list and language coverage, and the QA review panel. The AI-off message lifecycle test (`tests/e2e/01b`) passes. Not yet rehearsed end to end with the CEO.
