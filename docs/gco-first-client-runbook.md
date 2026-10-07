# First client runbook (internal)

For a GCO employee onboarding the first real client without touching the database. Every step below is a button or form in `/admin` ("Client onboarding", "Client integrations") unless noted. **Never put API keys, passwords, tokens or webhook secrets in sales notes, chat, email or the client profile** - the profile form refuses them; the only place a secret exists is the one-time integration secret.

## 0. Before the discovery call (confirm, do not assume)
Client/company legal name - the communication channel they want connected - business use case - expected conversation volume - operating hours - languages (English, Italian, French, German, Spanish, Swedish only) - coverage (24/7 only "subject to project staffing requirements") - escalation expectations (Operator -> Supervisor / Team Lead -> GCO Management / Client contact) - the client's technical contact.

## 1. Discovery call - capture (non-secret)
Client name - company - website - industry - service - channel/provider - whether the platform offers webhooks/an API - how it authenticates requests - callback requirements - volume - hours - languages - escalation process - first operator and supervisor - go-live target. Record the facts in the client profile (channel, website, operating hours, technical contact, escalation contact). **If the channel is a third-party platform** (WhatsApp, Instagram, ...), GCO needs that platform's API documentation and sandbox access *before* an adapter can be written: today only the generic signed-webhook contract (`docs/gco-webhook-contract.md`) is production-capable. Send the client that document if they can build to it.

## 2. Commercial path
Closed Won -> BPO handoff -> tenant -> onboarding appears in "Client onboarding" automatically. First-month payment is confirmed by Manager/CEO *after* handoff; commission is 10% of the first month actually collected, only after payment, never recurring. **A client who did not come through the CRM** (no lead, no commission): "Start onboarding for a new client" (company, contact name, contact email) - CEO/Assistant only, audited.

## 3. Technical onboarding (in this order)
1. **Invite the client.** Select the client -> "Create setup link" -> copy the one-time link (shown once, expires in 7 days) and send it to the contact yourself. The client sets a password; the checklist item "Client has set up their login" turns Pass (it shows Blocked while you wait).
2. **Operator.** Select the client -> "Add operator" (CEO): name, email, one-time password (10+ characters; share securely). The operator signs in and sets themselves AVAILABLE.
3. **Integration.** "Client integrations" -> pick the client, adapter `gco-webhook`, a name, the client's **https callback URL** -> Create. The secret is shown **once**: copy it into a secure channel to the client's technical contact. Lost it? Rotate (the old one stops immediately and verification is cleared).
4. **Client implements the contract** (`docs/gco-webhook-contract.md`): signing, inbound endpoint `.../api/v1/webhooks/<integrationId>` (shown in the console), outbound callback, idempotency on `message_id`.
5. **Verify.** Click "Verify (send signed test)" (GCO -> client). The client sends one signed `{"type":"ping"}` to the webhook URL (client -> GCO). The checklist item goes Fail -> Blocked (waiting for the client) -> Pass.
6. **Confirmations** (CEO/Assistant, after confirming with the client): supervisor/team lead, languages, coverage.
7. **Checklist** must be all Pass; "Go Live is blocked by ..." names anything left.

## 4. First smoke test (do this with the client, on the staged tenant or immediately after go-live)
CLIENT -> their channel -> GCO webhook -> authentication -> tenant routing -> deduplication -> persistence -> queue -> assignment -> operator -> operator reply -> outbound adapter -> client's callback -> client.
Record in the onboarding notes (no content, no secrets): inbound event id - conversation id - GCO message id - the client's delivery id (from their 2xx response `delivery_id` / `X-Request-Id`) - timestamps (client sent, GCO received, assigned, reply sent, client acknowledged) - delivery status - any retry - final result. Then confirm with the client that the end user actually received it, that sending the same `message_id` twice is ignored on their side, and that a duplicate inbound message did not create a second message in GCO. Do not quote any timing as an SLA.

## 5. Go Live
Only the CEO. "Go live" is enabled only when every checklist item passes; it activates only this client's verified, production-capable, staged integration. Rotating the secret or changing the callback URL after verification blocks go-live again until re-verified (a client already LIVE stays LIVE; re-verify before relying on the new secret).

## 6. After go-live
Watch "Needs attention" (SLA-capped conversations), SystemEvents `delivery` / `sla` / `onboarding`, and the integration status. A permanently failed reply (client answered 4xx/401/403) stays FAILED and raises a `delivery` event - fix the client endpoint or secret; there is no requeue button yet.

## What this runbook cannot do
Create a provider adapter for a third-party platform (needs that provider's documentation and credentials), verify the client's side (only the client can confirm receipt), or validate real-client behaviour: **real-client validation has not happened yet.**
