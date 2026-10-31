# 42 — Universal Virtual Support (UVS) meeting: technical preparation (for Thu 5 Nov 2026, 18:00 CET, not yet confirmed)

Who: Tamoor Shahbaz (UVS), Cristian (CEO), Mohammed (CTO). Topics UVS proposed: language coverage, pay-per-message pricing, CRM integrations, QA, security, operational readiness, referral commissions. Likely role for GCO: **specialist subcontractor** for European-language queues UVS does not cover.

Status labels follow `docs/technical-security-pack/partner-capability-brief.md` (live / release-ready / needs development). **Production is unchanged** and nothing here authorises a release; "release-ready" means built and tested but not deployed.

## 1. One-page summary to speak from

**What GCO is.** A written, human-handled conversation operation. Messages arrive from the partner's system, are queued per client and language, assigned automatically to a trained operator, answered by a person, quality-scored by a supervisor and counted for billing. **AI is switched off platform-wide; every reply is written by a person.**

**What fits UVS's case (subcontractor behind their queues)**
| UVS need | How it works | Status |
|---|---|---|
| Their queues reach us | Signed HTTPS webhook per integration (HMAC-SHA256, 5-minute replay window, duplicates ignored). Test mode first, signed ping both ways, go-live checklist | Live; simulator-tested only, **no real partner connected** |
| Our replies reach them | Replies posted to their HTTPS callback with an idempotency key; counted delivered only on 2xx; retries with backoff | Live |
| Delivery visibility | Operator sees Delivered / Sending / Not delivered; supervisors alerted to failures | Built on a branch, tested; **not in production yet** |
| Language coverage | Assignment matches conversation language to operator languages; no matching operator means the message waits and is retried every 15 s; manager sees coverage | Live |
| Pay-per-message | Per-message usage is recorded for every client and the billing model supports per-message pricing | Release-ready (usage counting is live; commercial back office is not yet deployed). **No rates quoted** |
| QA | Supervisors score real replies on accuracy, tone, resolution | Live |
| Response-time control | Deadline per assignment, automatic reassignment, manager alert after repeated misses (configurable) | Live |
| Client view | Each client sees only its own conversations, usage and reports; leak tests check no pay, margin or other-client data | Live (leak test built on the P0 branch) |
| Safe go-live | Integration is Sandbox until promoted to Production with a typed confirmation; a simulation can never go live | Built on a branch, tested; **not in production yet** |
| Exports (CSV) | Not available; reports are on screen | **Needs development** (in the P0 plan) |
| Native channel connectors (WhatsApp, Meta, Shopify), their specific CRM | Built per client against real API access and sandbox | **Needs development** |

**What we say plainly.** No real client yet; pilot is being prepared (2–5 operators). No certification and no independent security test yet (one is planned). Two-step login exists but is not yet required for all privileged accounts. Capacity measured only in development; no production capacity claim. No uptime or response-time guarantee.

## 2. Likely questions and honest answers

- **"Can you connect to our CRM/helpdesk?"** "Our interface is a signed webhook. Connecting your system depends on your API: send us the documentation and a sandbox and we will tell you simple, moderate or complex before any commitment."
- **"Do you work inside our tools or yours?"** "Either is possible in principle. Today operators work in our operator screen fed by your webhook. Working inside your tool would be a separate scoping."
- **"How do you keep our end customers' data safe?"** Role-based access enforced on the server; per-client separation tested automatically; audit trail of sensitive actions; encrypted connections; hosting in Germany; nightly backups with an offsite copy; no AI sees any conversation. Do **not** say certified, compliant, encrypted backups (until keys are installed), or penetration-tested.
- **"Will you sign a DPA / accept our security terms?"** "Yes in principle; our DPA text and annex are drafts awaiting legal review. We would need to see your flow-down terms."
- **"Where is data processed? Who can access it?"** Servers in Germany. Operators are in the EU/EEA. Engineering access from India to real client personal data is closed until a transfer assessment and safeguards are in place. (Say this only if asked; Cristian to confirm he is happy to disclose it.)
- **"What volume can you handle?"** "A pilot of two to five operators first. We have no production capacity claim; we measure it with you."
- **"Pricing?"** "Usage-based, per message, no fixed monthly commitment is the structure we are considering. Rates come after we know your languages and volumes." No numbers.
- **"Start date?"** "We are aiming to start a first pilot around the end of November or early December, subject to readiness and legal terms." Only say this if asked, as an aim, never as a promise.
- **"Referral commission / subcontractor terms?"** "Our partner terms are with our lawyer. Subcontractor arrangements are negotiated separately; we will not agree terms in this call."
- **"QA and training?"** Supervisor scoring is live; operator onboarding with a training gate and qualifications is release-ready; configurable scorecards and appeals need development.
- **"Is AI used?"** "No."

## 3. Demo plan (six minutes, local copy, fictional data)

Use `docs/sales-demo-script.md` with these changes for UVS:
1. **Lead with language coverage.** Send an Italian message first: it **waits in the queue** because no available operator speaks Italian in the demo set. Say: "This is what happens when a language is not covered: it waits, is retried, and the manager sees it. This is the gap UVS wants to fill." Then send an English message to show assignment, reply and delivery.
2. Show the integration console: sandbox vs production, check history, "simulation can never go live". (Only if the P0 branch is the build on screen; say it is not yet in production.)
3. Do not show billing, earnings, admin console, Hunter pipeline, or any password. Never production.
4. Before the call: run `npx tsx prisma/demo-showcase.ts --reset`, confirm health reports AI disabled, log in each role in its own window. The current demo database still contains a red "Not delivered" test reply from a failure test: reset removes it.

**Rehearsal on 1 Nov (local, clean demo stack, AI off):** health healthy with AI disabled. Italian message stayed queued as expected (the only available demo operator speaks English and Spanish). English message assigned within seconds; operator reply delivered; "Recently sent" shows Delivered. Not yet rehearsed with Cristian, and manager/client windows not re-walked this session.

## 4. What must not be said or shown
No prices or rates; no dates as promises; no certification, compliance, independent-test or uptime claims; no commission or contract terms; no AI replies; no production screen; no real personal data.

## 5. Open items before the call (owner)
- Cristian: confirm time with UVS; confirm role (subcontractor, referral, or both) and whether he is comfortable with the India-access disclosure; confirm the P0 branch build may be shown (with the "not in production" note).
- CTO: reset demo data and dry run on Wed 4 Nov; prepare to receive UVS's API documentation after the call; one-page capability sheet can be shared only after Cristian approves it.
- Not decided: whether to share the partner capability brief and security pack with UVS before the call (needs Cristian's OK; the security pack contains drafts).
