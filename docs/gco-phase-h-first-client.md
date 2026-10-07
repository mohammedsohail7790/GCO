# Phase H - first real client onboarding

**Status: PREPARED - REAL CLIENT VALIDATION: BLOCKED.** No real client or provider exists to onboard. Everything that GCO controls was made operable without engineering help; the real-client step cannot be performed or claimed.

## 1. Objective
Move from "production-ready infrastructure" to "first real client operating through GCO". If no client exists, finish all preparation and stop honestly.

## 2. Client / provider discovered
**None.** Searched code, env templates, dependencies, docs and production data (read-only). No client name, channel, provider, API/webhook specification, sandbox or credentials, callback URL, or decision exists anywhere. The only third-party named, Paxmod, is a moderation API without webhooks (not a conversation channel); WhatsApp/Instagram/etc. appear only as generic "client-specific, needs the client's credentials" rows. Production: two website-contact leads from 2026-09-28 (neither Closed Won), the demo tenant with its `dev-mock` integration, no handoffs, no onboardings. **Outcome B.**

## 3. Channel / integration architecture
Unchanged: `gco-webhook` (HMAC-signed, `docs/gco-webhook-contract.md`) is the only production-capable adapter; `dev-mock` can never go live. No provider adapter was written or simulated.

## 4. What was made operable (previously engineering-only)
Walking the 20-step first-client path found three steps that needed API calls or database access:
- **Client without a CRM deal** (tenant + onboarding + client login): new "Start onboarding for a new client" (`POST /admin/onboarding`, CEO/Assistant, audited, creates no lead/commission/revenue; retry is inline).
- **Operator login for the client's tenant**: new "Add operator" form (uses the existing CEO-only `POST /admin/users`).
- **Non-secret client facts** (channel, website, operating hours, technical and escalation contacts): `POST /admin/onboarding/:id/profile`, stored inside the existing `requestedProfile` JSON (**no migration**), strict five-field allow-list, 200-character limit, and a guard that refuses credential-looking values (API keys, vendor key prefixes, bearer tokens, `password:`/`secret=`, PEM, long opaque tokens). Audit records field names only.
Plus: the per-client panel now shows the integration (adapter, status, production-capable, callback URL, outbound/inbound verification, webhook path) and the operators on one screen. Secrets are never displayed.

## 5. Onboarding flow
See `docs/gco-first-client-runbook.md` (before the call, discovery capture, commercial path, technical onboarding, smoke test, go-live, after go-live).

## 6-9. Verification, smoke test, failure tests, go-live
Exercised end to end through the real API, worker and queue against a **local client simulator** (E2E 27, 10 tests): start -> invitation -> profile -> staged integration -> operator -> outbound verify -> client ping -> checklist FAIL -> BLOCKED -> PASS -> go-live (CEO only) -> signed inbound -> assignment -> operator reply -> 2xx -> DELIVERED -> duplicate/replay/wrong-secret refused -> client down (503), same idempotency key on retry, delivered once -> a second client onboarded in parallel and isolated -> **secret rotation blocks go-live until re-verified** -> no secret/content in audit or system events. This is **not** a real-client test and produces no production timings.

## 10. AI safety (audited)
The only writer of OUTBOUND messages is `operatorSendMessage`, reachable only through the operator-only `POST /messages/send` route; no AI module imports a send path; the OpenAI key is read only in the provider module (worker environment). Suggestions and memory extraction stay operator assistance.

## 11. BPO handoff and commission
Unchanged and re-run in the full regression: Closed Won does not create a commission; commission is 10% of the first month actually collected, after payment, once per lead; payout stays PENDING; month-2+ revenue never creates a commission (E2E 14, 23, 24).

## 12. Test results (final tree, one clean run)
Baseline before changes: unit 312, integration 81, E2E 213. After: unit **339**, integration **87**, E2E **223**; `tsc`, `eslint`, `next build` clean. New: unit +27 (credential guard), integration +6 (manual onboarding, profile, safe admin view), E2E +10 (first-client flow). During the run a test-harness issue appeared and was fixed: repeated suite runs exhausted the real login rate limiter for the shared demo accounts, so test logins now use their own rate-limit bucket (the limiter itself is unchanged and has its own tests).

## 13. Production deployment
Commit `46dde10`. **No migration** (profile lives in the existing JSON column). Web `bc1d760751c7` (rollback `gco-web:pre-phase-h` = `388ade0e9020`), worker `1618c8cd03f3` (rollback `gco-worker:pre-phase-h` = `4bb34f648640`); the worker was rebuilt because it imports the refactored onboarding service. Postgres, Redis and realtime untouched (0 restarts). Verified read-only: health 200 (both hosts); 27 sitemap URLs, login, invitation, admin and manager pages 200; all 73 booking CTAs still point at the official Calendly event; every onboarding, profile, retry, go-live, integrations, users, needs-attention, CRM and send endpoint 401 anonymously; unknown webhook 404; WebSocket 101; web/worker logs clean; migration state unchanged; `ALLOW_DEV_ADAPTERS` unset in both containers; production data identical before/after (2 website leads, 1 demo tenant, 1 `dev-mock` demo integration, no handoffs or onboardings); the SLA-capped demo conversation unchanged (0 active assignments, 1 escalation). Nothing was created in production.

## 14. Real-client result
**REAL CLIENT VALIDATION: BLOCKED.** Missing, exactly: a first client (or a signed engagement to onboard); the channel/provider they use; if it is not the generic `gco-webhook` contract, that provider's API documentation and sandbox credentials; the client's HTTPS callback URL; a secure channel for the one-time integration secret; a client-side engineer to implement or confirm their side of the contract and a time slot for the smoke test.

## 15. Remaining risks
Real-client behaviour unverified; delivery is at-least-once (client must dedupe `message_id`); a permanently failed reply has no requeue button; operator and client passwords are chosen by the CEO / set via a one-time link (no forced rotation); an Assistant can start onboarding but only the CEO can create operator logins and go live; production latency unmeasured.

## 16. Next action
Not another engineering phase: **sell and onboard the first client** with the runbook, starting from the Calendly booking.
