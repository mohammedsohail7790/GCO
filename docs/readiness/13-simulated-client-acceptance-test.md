# 13 — Full simulated client acceptance test

**Test:** `tests/e2e/53-simulated-client-acceptance.spec.ts` (11 steps, one scripted "client company"). **Result on 2026-10-20: 11 of 11 passed** on a local stack (real PostgreSQL/Redis/web/worker; synthetic data; AI off for this client).
**What it is:** the whole commercial relationship end to end on GCO's side, with a local program standing in for the client's platform, speaking the documented signed `gco-webhook` contract. **What it is not:** a real-client validation — no real client platform, credentials, volumes or network conditions are involved, and the client simulator is friendlier than a real system. A real client acceptance test is still required (`04-api-integration-process.md`).

## Scenario and what each step proved
| # | Step | Proved |
|---|---|---|
| 1 | The CEO sets the client up in **one wizard call**: services (chat support, multilingual, moderation), languages en/es, a **test** operator pay rate, per-message billing, human-only AI mode, invitations for a client contact, a manager and two operators; each person activates their own account with a one-time link | setup creates a working workspace; links are single-use; roles and tenant are right; no warnings |
| 2 | Connect the client platform: staged integration, GCO→client ping, client→GCO ping, go-live refused before verification and accepted after | production-capable adapter flow; fail-closed go-live; integration active only after both proofs |
| 3 | Five customer conversations in two languages plus one duplicate delivery | English chats reach the English operator, Spanish chats the Spanish operator; the duplicate creates one message |
| 4 | Manager adds the client's quick replies; operators see only their language's reply and answer | per-language knowledge; four replies delivered once each; **every callback carries a valid GCO signature** |
| 5 | **Client outage** during a reply (503), then recovery | the failed attempt is retried with backoff and delivered after recovery; exactly **one** outbound message exists however many attempts were made |
| 6 | Operator escalates a sensitive case; manager claims and resolves | escalation flow; the client cannot see the internal note |
| 7 | Client sends three items to the moderation feed (signed, idempotent); operator rejects one, approves one, escalates one; manager resolves; client reads counts | moderation end to end; duplicate feed creates nothing; client sees counts only, no operator names |
| 8 | Quality review; operator earnings; CEO payout | each operator's earnings equal delivered replies × the test rate (3×7 and 2×7 cents); a manager cannot pay; paid status flows to the operator; operators see only their own figures |
| 9 | Invoice and reconciliation | invoice = customer messages received × price (+22% VAT); draft invisible to the client until issued; **reconciliation has zero mismatches**; margin = billed − operator pay |
| 10 | A privacy **erasure** for one end user; isolation check against a second client | the person's content is removed, other users untouched; usage, earnings and invoice records unchanged; the other client sees none of this client's data |
| 11 | AI check | no AI generation or memory exists for the client |

## Defects found and fixed by writing this test
1. **Reconciliation compared the wrong messages.** It flagged every operator reply as "delivered but never billed", although the client is billed per *customer* message processed. Fixed: it now flags *customer messages received without a usage record* (`receivedWithoutUsageRecord`), and the screen text and tests were corrected.
2. **"Human-only" only hid AI output.** With AI globally on, a client set to human-only still had suggestions *generated and stored*. Fixed: no provider call and no stored suggestion or memory for human-only clients. (With the deployed configuration, AI is globally off, so nothing is generated for anyone.)
3. **Documentation error:** the integration-contract documentation named the language field `language`; the real field is `lang`. Corrected in the Technical & Security Pack.

## Limits of this test (read before relying on it)
- Single process stack on a laptop: no network latency, TLS, proxies, load, or partial failures other than the scripted outage.
- Operator behaviour is scripted (no real people, no multitasking, no shift changes, no SLA breach in this scenario — SLA behaviour is covered by other tests).
- The simulator always speaks the contract correctly; a real client will not.
- Delivery success depends on GCO's own interpretation of "200 = delivered"; a real client may acknowledge asynchronously.
- Not covered here: email notifications (needs SMTP), invoices as fiscal e-invoices (not built), moderation verdicts back to the client (not built), real provider rate limits.

## How to run it
Local stack with the dev adapter flag (as in `docs/testing.md`) and `npx playwright test tests/e2e/53-simulated-client-acceptance.spec.ts`. It creates and deletes its own tenant; it never sends anything outside the machine.
