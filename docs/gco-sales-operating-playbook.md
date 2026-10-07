# GCO sales operating playbook

How Cristian (and any future sales team member) takes a prospect from a Calendly booking to a live client, using only the GCO screens. Nothing here sends anything to a prospect automatically: every outreach step is a human action. **Never put API keys, passwords, tokens, webhook secrets or private keys in the CRM - the discovery, notes and activity fields refuse them.**

## Roles at a glance
- **CEO (you, `/admin`)**: sees the whole funnel (leads, qualification, follow-ups, onboarding, live clients, first-month revenue, pending commission), adds leads, creates Hunter logins, approves deals, confirms the first payment, runs onboarding and go-live.
- **Hunter (`/hunter`)**: owns leads, records discovery, moves stages, submits Closed Won for approval, earns the 10% first-month commission. **The person who submits a deal cannot approve it**, so a one-person team needs *two* logins: a Hunter login for selling (create it in `/admin` -> "Add a Hunter login") and the CEO login for approving.
- **Manager (`/manager`)**: team view, follow-up oversight, approves deals, confirms payment. Does not see revenue/commission totals.

## The funnel (stage = what to do next)
`NEW` -> `CONTACTED` -> `ENGAGED` -> `QUALIFIED` -> `MEETING_BOOKED` (the discovery call) -> `PROPOSAL` (proposal and negotiation) -> `PENDING_APPROVAL` -> `CLOSED_WON` (or `CLOSED_LOST` from any open stage). There is no separate "Negotiation" stage: keep the lead at `PROPOSAL` and use *next action* ("negotiating pilot terms") to track it. "Qualified / Needs follow-up / Not qualified" is a separate, explicit flag on the lead (set it in the Discovery panel; there is no score).

## 1. A lead comes in
- **Website pilot or contact form**: becomes a lead automatically (source `website_pilot_form` / `website_contact_form`), unassigned. A repeat submission from the same email is added to the same lead.
- **Calendly booking**: the booking is *not* connected to GCO (see "Calendly" below). When you get the Calendly notification email, `/admin` -> "Add a lead" (source *Calendly booking*). Duplicates are blocked by email (any letter case) and tax ID; a matching website domain only warns.
- Referral / outbound: same "Add a lead" form with the right source.

## 2. Ownership
A Hunter claims the lead from the unassigned pool; it is then theirs for **30 days**, extended by any recorded activity or discovery update. After 30 days of inactivity it returns to the pool (leads awaiting approval or already won are never released). A Hunter cannot touch another Hunter's lead.

## 3. Qualification (explicit, human)
In the lead's **Discovery** panel set *Qualification*:
- **Qualified**: a clear use case, enough conversation volume, a suitable channel, a decision maker identified, technically feasible, genuine commercial interest, a realistic timeline.
- **Needs follow-up**: promising but something is unknown - set *Next action* and *Due* so it appears in "Follow-ups due".
- **Not qualified**: record why in the discovery notes, then move the lead to `CLOSED_LOST`.

## 4. First response
Within one business day, personally (email or call - GCO sends nothing for you). Log it: **Log activity** (Hunter) so "days since contact" is accurate and the lock extends.

## 5. Discovery call (the 30-minute Calendly call)
Open the lead -> **Discovery** and fill the four sections during or right after the call. Questions:
- **Business**: company, website, industry, the service they want, target market, current conversation volume, how support/sales conversations run today, the main pain, the outcome they want, urgency, who decides.
- **Operations**: channels, operating hours, languages (English, Italian, French, German, Spanish, Swedish only), coverage (24/7 only "subject to project staffing requirements"), expected volume, escalation requirements (Operator -> Supervisor / Team Lead -> GCO management / client contact), operator and supervisor needs.
- **Technical**: channel/provider; does the platform have an API or webhooks; documentation (a *link* only); sandbox; technical contact; callback URL requirements; the *type* of authentication (e.g. "HMAC-signed webhook") - never the credential.
- **Commercial**: scope, the free 7-day pilot, pricing discussion, expected start date, decision process, the agreed next step.
Then set *Qualification*, *Next action* and *Due*, and move the stage to `MEETING_BOOKED` (and on).

## 6. Technical discovery
If the client can build to GCO's signed-webhook contract, send `docs/gco-webhook-contract.md`. If their channel is a third-party platform (WhatsApp, Instagram ...), GCO needs *that platform's* API documentation and sandbox access before any adapter can be written - this is an engineering request, not something to promise.

## 7. Proposal and 8. Negotiation
Stage `PROPOSAL`. Keep *Next action* current ("send proposal", "negotiate scope"). The pilot is genuinely free: no setup fee, no long-term commitment; after the pilot the client chooses whether to continue under agreed commercial terms. Do not promise response times, guarantees, certifications or customers.

## 9. Closed Won
Hunter: **Submit for approval** (one approval only, even on a double click). Manager/CEO (not the submitter): approve. Approval moves the lead to `CLOSED_WON` and automatically starts the BPO hand-off. **Closed Won pays nothing by itself.**
Closed Won checklist: the discovery record is complete - scope and start date agreed - the client contact's email is correct (it becomes their login) - the channel/provider is known - you know who the first operator and supervisor will be.

## 10. First payment
When the client has actually paid the first month, Manager/CEO: confirm the payment in `/admin` (amount in EUR). GCO then creates the Hunter's commission: **10% of the first month actually collected, once, never recurring**, status Pending until the CEO approves and pays it. Later months' revenue never creates commission.

## 11. BPO hand-off
Automatic after approval: one tenant, one onboarding record and an inactive client login are created (re-running creates no duplicates). Check `/admin` -> "Client onboarding": the client appears with its checklist.

## 12. Client onboarding (see `docs/gco-first-client-runbook.md`)
Create the client's setup link and send it yourself -> add the client's operator -> record the non-secret client profile -> confirm supervisor, languages and coverage with the client.

## 13. Integration
`/admin` -> "Client integrations": create a staged `gco-webhook` integration with the client's HTTPS callback URL; deliver the one-time secret through a secure channel (never email/chat); the client implements the contract; **Verify** (GCO -> client) and the client's signed ping (client -> GCO) turn the checklist green.

## 14. First smoke test
Follow the runbook: one real message from the client's channel -> operator reply -> delivered to the client; record ids and timestamps (no content, no secrets). Confirm duplicates are ignored on both sides.

## 15. Go Live
CEO only, only when every checklist item is Pass.

## 16. After go-live
Watch "Needs attention" (SLA-capped conversations) and `delivery` system events; keep the lead's *Next action* for the account review; record month-2+ revenue in the revenue entry (it never creates commission).

## What NOT to collect in the CRM
API keys - passwords - bearer or OAuth/refresh tokens - webhook secrets - private keys or PEM blocks - card or bank details - end-customer message content. The system refuses credential-shaped text in notes, activities, approval notes and the discovery fields; record *where* a credential will be exchanged, never the credential.

## Calendly (what is and is not connected)
The website links to `https://calendly.com/cristianidiaghe9/30min`. GCO does **not** receive booking events: there is no Calendly webhook or API integration, so bookings, cancellations and reschedules are not tracked and "calls held" cannot be reported. Process: Calendly emails you -> add the lead -> run the call -> record discovery. **Future integration, if volume justifies it, needs:** a Calendly plan that includes webhooks and a personal access token or OAuth app (credentials supplied through the secure environment, never the CRM); a webhook subscription to `invitee.created` and `invitee.canceled` (and reschedule handling) delivered to an authenticated GCO endpoint (Calendly's signing key verified, replay-protected); mapping of invitee email to a lead with the existing duplicate rules (email hard-match, domain warning), no duplicate leads on re-booking; a decision on which Hunter owns a Calendly-originated lead; and a privacy review of the invitee data stored.
