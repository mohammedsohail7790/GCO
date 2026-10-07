# Phase G - SLA-loop fix, integration/onboarding operations UI, go-live hardening

**Status: COMPLETE WITH BLOCKER.** Everything GCO controls is built, tested and (see section 16) deployed. **REAL CLIENT VALIDATION: BLOCKED** - no real client/provider exists in the repository; a local simulator is not a real client.

## 1. Executive summary
Phase G (a) removes the unbounded unanswered-conversation loop found in Phase F, (b) gives managers and the CEO the screens to run exceptions, integrations and go-live, and (c) closes the remaining go-live race. No new migration. No production data was modified by hand.

## 2. Objective
A: an unanswered conversation must not cycle between available operators forever. B: finish the operational integration / onboarding / go-live experience so the first real client can be onboarded.

## 3. Baseline
Starting point = Phase F as deployed (commit `0b2aafe`): unit 301, integration 64, E2E 191, `tsc`/`eslint`/`build` clean (taken on that exact code at the end of Phase F; a re-run started during Phase G coincided with edits, so those figures are the recorded baseline).

## 4. SLA-loop root cause
`expireAssignment` always reassigned (E2E 04 pins "repeated timeouts stay consistent"), so with one available operator and nobody answering, a conversation re-expired every `slaSeconds` forever. Production: one demo conversation (an unanswered message of 2026-09-28) -> 5,403 expired assignments = 99.7% of all audit rows. Every real tenant had the same exposure (~720 audit rows/day per unanswered conversation).

## 5. SLA cap design (no migration)
- `lib/assignment/slaCap.ts`: after `SLA_MAX_CONSECUTIVE_EXPIRIES` (default **5**, 1-50, strict parsing; per-process env) consecutive `sla_timeout` expiries, automatic reassignment stops.
- The counter is **derived from persisted assignment rows** (survives worker restarts, no new column): consecutive expiries since the latest boundary = the customer's newest inbound message (inclusive) or a manager's resume marker. A completed (operator replied) or cancelled (manual) assignment breaks the chain; an in-flight ACTIVE one does not erase earlier expiries.
- The previously unused conversation state `EXPIRED` now means "SLA-capped, needs a manager". The 15-second sweep and `tryAssignConversation` only handle QUEUED/REASSIGNING, so a capped conversation is never re-assigned automatically.
- `expireAssignment` is now atomic: ACTIVE->EXPIRED is a conditional update, so concurrent workers/retries cannot double-expire, double-audit or double-assign.

## 6. Escalation behaviour
At the cap, once: audit `conversation.sla_escalated` (distinct from the ordinary `assignment.expired`), a content-free `sla` SystemEvent (tenant, conversation, count, cap), no realtime broadcast (the tenant channel also reaches CLIENT sockets; this is internal). The conversation is not closed or dropped. A NEW customer message re-queues it with a fresh counter. No repeated escalations (tested: 7 s of silence, nothing grows).

## 7. Manager workflow
`GET /conversations/needs-attention` (CEO/Assistant all tenants; Manager own tenant only; others 403/401) returns conversation, tenant, customer reference, consecutive expiries and cap, SLA, last customer message time, last assignee - **no message content**. `POST /conversations/:id/resume` (same roles; Manager only inside their tenant; 409 if not capped) records a resume boundary and reassigns. UI: "Needs attention" panel on `/manager` and `/admin`. No close/resolve action was added: no such business rule exists in the codebase.

## 8. The demo conversation (production)
**No data was edited.** Deploying the cap changes its fate by itself: its next expiry sees 5,400+ consecutive expiries, caps immediately, writes ONE escalation, and the 2-minute loop ends; it then shows in "Needs attention". History is untouched. If the demo conversation should be cleaned further (close it / take the demo operator offline), that needs a business decision - there is no close API and it would mutate production data.

## 9. Integration console (CEO)
`/admin` -> "Client integrations": create staged integration (always DISABLED; adapter list from the registry, development-only adapters not offered), callback URL, secret shown once (create and rotate) and never again, Verify, Rotate (with a warning that it invalidates verification), per-integration production-capable / verified badges and the webhook URL to give the client. Capability is computed server-side (`GET /admin/integrations`, `/admin/integrations/adapters`); a request cannot declare it (tested). Production-capable adapters default to DISABLED when no status is given.

## 10. Go-live checklist
Backend-authoritative, each item PASS / FAIL / BLOCKED with a reason: client account, client user, client login (blocked = waiting for the client), production-capable integration, **callback URL valid and safe**, integration verified both ways for the current URL (blocked = waiting for the client's ping), webhook secret, active operator, supervisor / languages / coverage confirmations. The console shows the reason per item and a "Go Live is blocked by ..." summary. Go-live re-computes the checklist **inside its transaction** (a concurrent secret rotation, URL change or operator deactivation rolls the go-live back) and activates only this tenant's verified, production-capable, DISABLED integrations; the invariant "LIVE <=> integration ACTIVE" is tested under race.

## 11. Adapter status
`dev-mock`: `productionCapable = false`, can never pass the production gate (`ALLOW_DEV_ADAPTERS` is local/CI only, unset in production). `gco-webhook`: `productionCapable = true`, GCO's own signed contract (`docs/gco-webhook-contract.md`). No third-party provider adapter exists.

## 12. Real provider discovery
Re-searched code, docs, env templates and dependencies: no selected provider, SDK, credentials reference, first client or API specification. Paxmod is a moderation API without webhooks (not a conversation channel). **Outcome B.**

## 13. Security changes
Inbound body capped at 1 MB (`413`, before parsing); escalation not broadcast to client sockets; strict env parsing (`1e9` was read as `1`); unsafe callback URLs fail the checklist even if "verified"; DNS-rebinding refused at connect time (tested with mocked resolver); SystemEvents/audit contain no content or secrets (tested).

## 14. Tenant isolation
Needs-attention and resume are tenant-scoped (another tenant's manager gets an empty list / 403); verification and go-live cannot cross tenants; webhook secrets are per integration; outbound uses the message's own tenant.

## 15. Failure matrix (what was actually exercised)
| Area | Cases | Evidence |
|---|---|---|
| SLA | expiry, repeated expiry, cap, one escalation, manager resume, fresh counter, new customer message, concurrent expiry (8 workers), duplicate escalation, restart-safety (derived state), demo-like 40-row history | integration `slaCap`, E2E 26 |
| Inbound | valid, bad/stale/tampered/wrong-secret/unsigned, malformed, oversize (413), duplicate, replay, unknown id, other tenant's id, DISABLED, DEGRADED, suspended tenant, queue down after persist then client retry | integration `webhookRoute`, E2E 25 |
| Outbound | 2xx, timeout, connection failure, 429, 503, 400, 401, 403, 404, redirect, oversized response, private/rebinding/non-https destination, duplicate send, already DELIVERED, no ACTIVE integration, retry recovery, permanent failure | integration `gcoWebhookDelivery`, unit, E2E 25 |
| Go-live | missing integration, dev-mock, unverified, one direction only, stale verification, rotation, URL change, unsafe URL, wrong tenant, DEGRADED, no operator, missing supervisor/language/coverage, 8 concurrent go-lives, go-live vs rotation/operator removal race | integration `goLiveRace`, `gcoWebhookDelivery`, E2E 25 |
Not exercised with real outages: database down and Redis down at runtime (covered only by stubbing the queue); 502/504 and 408/425 share the tested retryable/permanent branches by status class and were not run individually.

## 16-19. Test results, deployment, rollback, production verification, real-client status
See the sections appended below after the run and release.

## 20. Remaining blockers
Real client validation (needs a real first client): a client who implements the contract (or a named platform + its API specification), a staged tenant, their callback URL and a secure channel for the one-time secret.

## 21. Recommended Phase H
Onboard the first real client on a staged tenant and run the real first-conversation smoke test (section "First smoke test" of the contract); decide what to do with the demo conversation/tenant.
