# Phase E - client onboarding automation + payment contract hardening

Status: **deployed and verified in production on 2026-10-06** (commit `ef51c63`). Local verification before release: unit 236, integration 53, E2E 180, `tsc`/`eslint`/`next build` clean, real-browser QA.

## 1. Executive summary
Before: after Closed Won the BPO handoff created a Tenant and stopped. Everything else - the client's login, readiness tracking, go-live - was manual and untracked, and the payment endpoint accepted any positive number with no currency.
After: a successful handoff now enqueues an idempotent onboarding job that creates the client user (inactive) and an onboarding record with an explicit state and a computed go-live checklist. The CEO/Assistant issues a one-time setup link, confirms what only a human can confirm, configures the integration with the existing admin API, and presses **Go live**. Payments are EUR-cents only, bounded and validated. Nothing goes live automatically.

## 2. Audit findings (verified in code)
| Question | Finding |
|---|---|
| Handoff | `bpoHandoffProcessor` upserts a Tenant keyed on the lead id; idempotent; retries via BullMQ (5 attempts, exponential backoff), dead-letter + SystemEvent, `POST /crm/bpo-handoffs/:id/retry`. |
| Client user | **Manual only**: `POST /admin/users` with an admin-chosen password. No invitation, reset or "must change password" mechanism existed. |
| Integration | `POST /admin/integrations` (CEO). The **only registered adapter is `dev-mock`** (a development mock) - no production adapter exists, so an integration cannot be safely auto-created. |
| Queue/service config | There is no queue entity. Per-tenant defaults (SLA, operator capacity, pricing) are applied by the Tenant model at creation. Operators are `OPERATOR` users per tenant. Supervisors are not tenant-modelled. |
| Go-live | No concept. |
| Audit/SystemEvents | Existing `writeAuditLog` / `SystemEvent`; reused. |
| Payment | `amountEurCents` any positive int, no upper bound, no currency; `RevenueRecord` has no currency column (EUR by convention). `POST /crm/revenue` accepted 0, no bound, did not check the tenant exists or period order. |
| Real bug found by browser QA | The invitation page kept a stale "missing token" state when the link was opened in an already-open tab (hash-only navigation). Fixed (it now follows `hashchange`). |

## 3. Does this need a migration? Yes - one, additive
Invitation tokens must be stored hashed with an expiry and a used marker, the onboarding state must be explicit and queryable, and idempotency needs unique keys (lead, tenant, user). No existing table can hold this without overloading unrelated JSON columns. Migration `20261006084144_add_client_onboarding`: **creates** enum `OnboardingStatus` and table `ClientOnboarding` (+ unique/status indexes, one FK to Tenant). It alters/drops nothing and touches no existing rows. Tested locally via `prisma migrate deploy`.

## 4. Onboarding flow
Closed Won -> approval -> handoff job (Tenant) -> **onboarding job** (same queue, same retry/dead-letter policy) -> client user (inactive, unusable password) + `ClientOnboarding` -> status `SETUP`.
Then, in the CEO/Assistant console (`/admin`, "Client onboarding"): create setup link -> client sets password -> configure the integration (existing admin API, staged `DISABLED`) -> assign an operator (existing admin API) -> confirm supervisor / languages / coverage -> status `READY_FOR_GO_LIVE` -> **Go live** (CEO only).

## 5. State machine
`PROVISIONING` (record exists, user not yet) -> `SETUP` (provisioned; required items outstanding) -> `READY_FOR_GO_LIVE` (all required items true) -> `LIVE` (explicit go-live; sticky). `FAILED` is set by a provisioning failure (or exhausted retries) and cleared by the next successful run. The status is re-derived (`reconcileStatus`) after every action and on admin reads, so it cannot go stale when an operator or integration is created through the existing APIs.

## 6. User invitation
The worker never knows a password. The user is created `isActive=false` with a random bcrypt hash nobody has, so login fails identically to any bad credential. The admin issues a link (`POST /admin/onboarding/:id/invitation`): 256-bit random token, **only its SHA-256 is stored**, 7-day expiry, shown once in the response, re-issuing invalidates the previous token. The link carries the token in the **URL fragment** (`/accept-invitation#token=...`) so it is not sent to servers, proxies, logs or Referer headers; the page removes it from the address bar. `POST /auth/accept-invitation` (public, rate-limited per IP): atomic single-use claim, password >= 10 chars, one generic error for unknown/expired/used/malformed tokens (no oracle). Acceptance is audited. No email is sent - GCO has no outbound email provider; the admin delivers the link.

## 7. Integration provisioning
Deliberately **not automated**: no production adapter exists, and activating an integration can start external traffic. The checklist tracks it (an integration with a *registered* adapter exists; a webhook secret exists - presence only, the secret is never selected). Existing endpoints are unchanged (secret generated by GCO or supplied, returned once). **Go-live activates the tenant's staged `DISABLED` integrations** - an explicit CEO action, audited with the count.

## 8. Queue / service defaults
Reused: Tenant defaults (SLA 120 s, operator capacity 2, pricing) apply at creation and are shown read-only in the console. No new configuration platform was built.

## 9. Pilot data -> onboarding (explicit mapping)
| Pilot field | Destination | Validation | Editable | Client-visible |
|---|---|---|---|---|
| Service | `requestedProfile.services` | must equal a form option (not "Not sure yet") | informational | no |
| Languages | `requestedProfile.languages` | intersected with the six approved languages | informational; **confirmation required** | confirmation state only |
| Coverage | `requestedProfile.coverage` | must equal a form option | informational; **confirmation required** | confirmation state only |
| Volume | `requestedProfile.volume` | must equal a form option | informational | no |
| Message, company, website | not copied | - | - | - |
It is a starting point shown to management; it configures nothing.

## 10. Go-live checklist (computed server-side)
Client account created - Client user created - Client has set up their login (user active) - Integration configured (registered adapter) - Webhook secret issued - Operator assigned (active operator in the tenant) - Supervisor confirmed (manual) - Languages confirmed (manual) - Coverage confirmed (manual). Go-live refuses (409 `CHECKLIST_INCOMPLETE`, naming the missing items) until all are true. Clients see only five client-safe steps.

## 11. Payment contract
EUR-only, integer cents (the model has no currency column; multi-currency would need a schema change and is out of scope). `lib/crm/money.ts`: amount `1..100,000,000` (EUR 1,000,000, a typo guard), `currency` optional and must be exactly `EUR`. Applied to `POST /crm/leads/:id/confirm-payment` and `POST /crm/revenue` (which also now rejects period end <= start and unknown tenants with 404). Commission is unchanged: exactly 10% of the first month actually collected, one per lead (unique key), atomic with the first revenue record; Hunter stored rate, estimated value and month 2+ revenue never matter; payout stays `PENDING`. A retry after a committed request returns a deterministic 409.

## 12. Security
Tokens: hashed at rest, expiring, single-use, never in audit/SystemEvents/logs (tested). Passwords: never generated or displayed. Integration secrets: unchanged discipline, never selected. Errors stored/logged are single-line, truncated and email-redacted. Public endpoint: rate-limited, generic errors. Setup links must be treated as secrets by the person delivering them.

## 13. RBAC
`ONBOARDING_VIEW/MANAGE`: CEO_ADMIN, ASSISTANT. `ONBOARDING_GO_LIVE`: CEO_ADMIN. `ONBOARDING_VIEW_OWN`: CLIENT. **Manager is deliberately excluded** (client contact data, login links). Verified over HTTP for anonymous (401) and Hunter/Manager/Operator/Client (403) on every endpoint.

## 14. Tenant isolation
The client status endpoint takes the tenant from the session, never the request. A client cannot reach any admin/CRM/finance endpoint; another tenant's client sees none of this onboarding. The accept-invitation flow cannot adopt an account in another tenant (`EMAIL_IN_USE`, recorded as a visible failure).

## 15. Retry / DLQ
Reused. `onboarding` jobs run on the existing BPO queue (5 attempts, backoff) with a deterministic job id; `enqueueClientOnboarding` removes a finished/failed job with that id first (BullMQ otherwise ignores the add). A re-delivered handoff job re-enqueues onboarding. The dead-letter handler updates the onboarding record for onboarding jobs and no longer flips an already-`SUCCEEDED` handoff to `DEAD_LETTERED` (which would have blocked payment confirmation). Failure -> `FAILED` status + `lastError` + `onboarding.failed` audit + `onboarding` SystemEvent; `POST /admin/onboarding/:id/retry` re-runs it.

## 16. Failure matrix
| Failure | Result | Evidence |
|---|---|---|
| Handoff not finished | 409 `HANDOFF_NOT_READY`, nothing created | integration |
| Duplicate / concurrent onboarding | one record, one user, one audit event per step | integration (6-way race) |
| Crash after record, before user | retry creates only the user | integration |
| Crash after user, before link | retry links the existing user, no new user, no audit duplicate | integration |
| Contact email belongs to another account | `FAILED`, visible event, address not leaked; converges after resolution | integration |
| Retry after full success / after LIVE | no change | integration, E2E |
| Queue/Redis down after approval | decision stands, handoff PENDING, SystemEvent, retry endpoint | Phase D test |
| Unauthorized retry / cross-tenant access | 401/403 | E2E |
| Replay / expired / concurrent invitation | generic 400; one winner | integration, E2E |
| Payment: duplicate, 6-way race, bad amount, bad currency | one commission/revenue; 400 on invalid | E2E, integration |
Not simulated with real process kills: worker-crash cases are covered by seeding the exact partial states the idempotent steps must recover from.

## 17. Production deployment (done)
- **Order executed:** fresh backup (local dump + `pg_restore --list` integrity check + B2 offsite upload verified, object `gco-postgres/gco-postgres-20261006T090449Z.dump`, 777,451 bytes) -> rollback tags -> rsync (server HEAD `ef51c63`) -> `docker compose build web worker` -> `prisma migrate deploy` from a one-off container -> `docker compose up -d --no-deps web worker`.
- **Migration:** `20261006084144_add_client_onboarding` applied (previous: `20261005211102_add_escalations`); `ClientOnboarding` and enum `OnboardingStatus` exist; 0 rows. Additive only.
- **Images:** web `9020e1890527`, worker `324450996f2e`. Rollback: `gco-web:pre-phase-e` = `de7643cd81cc`, `gco-worker:pre-phase-e` = `762af9d7d127` (retag as `latest`, `docker compose up -d --no-deps web worker`; optional table drop documented below).
- **Restarted:** web and worker only. Postgres, Redis, realtime untouched (0 restarts, original start times).
- **Verified read-only:** health 200 (apex and app host); all 27 sitemap URLs and key pages 200; unknown slug 404; every CRM, onboarding, go-live, client-status and integration endpoint returns 401 anonymously; a bogus invitation token returns a generic 400; WebSocket 101; web and worker logs clean (the single `NoFallbackError` line is Next's internal log for a 404 probe of an unknown article slug); production row counts unchanged before/after (Lead 2, Tenant 1, User 5, Integration 1, Commission 0, RevenueRecord 0, BpoHandoff 0, Message 1, SystemEvent 3; AuditLog +2 recurring `assignment.expired` rows from an existing assignment, unrelated).
- **dev-mock safety in production:** `ALLOW_DEV_ADAPTERS` is unset in the server env file, compose file and both running containers; the deployed bundle contains the gate; with no production adapter registered, go-live cannot be satisfied or activate anything. Go-live was deliberately **not** exercised in production (it would require creating production data).
- **Rollback of the schema (optional, not needed for a code rollback):** `DROP TABLE "ClientOnboarding"; DROP TYPE "OnboardingStatus";` then `prisma migrate resolve --rolled-back 20261006084144_add_client_onboarding` before any re-apply. Rehearsed on a local copy in a rolled-back transaction.

## 18. Known limitations
No email delivery (links are copied by the admin); no production integration adapter, so integration setup stays a CEO step; supervisor assignment is a manual confirmation (supervisors are not tenant-modelled); the console is a compact admin panel, not a full client-success tool; EUR-only; `RevenueRecord` has no currency or invoice reference; pre-existing handoffs are not back-filled.

## 19. Recommended Phase F
**Per-client go-live runbook + first-conversation smoke test:** with a real adapter for the first client, an admin-triggered synthetic message through the client's webhook into the queue and an operator, recording the result in the onboarding checklist - the last unverified step before real traffic.
