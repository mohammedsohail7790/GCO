# 15 — Demonstrating the four workflows with simulated data

All data is fictional. Run only on the **local or staging** stack, never production (the seed scripts refuse a production-mode process). Logins and passwords are created by the seed (`prisma/seed.ts`, `prisma/staging-seed.ts`); they are not repeated here.

**Prepare:** start the stack (`~/gco-local/start.sh`), `npm run seed`, then `npx tsx prisma/demo-showcase.ts --reset` for a populated demo client (conversations, QA reviews, a lead pipeline).

| Role | Where | What to show (≈ 3 min each) |
|---|---|---|
| **Operator** | `/operator` | go Available → conversation is assigned with a response timer → read client instructions (Knowledge) → reply → mark resolved; earnings page shows the message as payable; moderation queue **Get next items** → approve / reject with category / escalate |
| **Manager / Supervisor** | `/manager`, supervisor team view | live queue and SLA timers; transfer a conversation to another operator; resume an operator paused after repeated SLA expiries; QA review with scoring; shift plan and absences; confirm a moderation escalation |
| **Client** | `/client` | own conversations only; usage and invoices view; requests/messages to GCO; moderation counts; no AI draft content and no other client's data (isolation proved by E2E `05`) |
| **Founder / CEO** | `/admin` | executive overview; new-client wizard (services, language, SLA, AI mode HUMAN_ONLY); rate cards and payouts; billing: issue an invoice, view reconciliation; privacy: retention window, data-subject export/erasure; hunter leads pipeline |

**Automated proof of the same flow:** `tests/e2e/53-*` runs the 11-step simulated client acceptance test end to end (`docs/readiness/13-simulated-client-acceptance-test.md`).

**Limits to say out loud in a demo:** replies go to a simulator, not a real client platform; AI is off by design; moderation verdicts are not sent back to a client platform; invoices are commercial invoices, not Italian e-invoices.
