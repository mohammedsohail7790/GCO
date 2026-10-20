# 02 — Security and reliability audit

**Date:** 2026-10-20 · **Scope:** application code at `ad51553` plus the fixes made in this work · **Not in scope / not possible here:** the production server, Cloudflare, Backblaze, GitHub organization settings (no access), penetration testing by a third party (none has been done).

Severity: Critical / High / Medium / Low. Status: Fixed · Open · Mitigated · Accepted.

## 1. Findings

| ID | Finding | Severity | Evidence | Remediation | Regression test | Status |
|---|---|---|---|---|---|---|
| F-1 | **AI was ON by default.** `FEATURE_AI_SUGGESTIONS`/`FEATURE_AI_MEMORY` defaulted to true; `AI_PROVIDER` defaulted to the mock, so a default deployment generated and displayed mock suggestions; `AI_PROVIDER=openai` + key would have called the live API; queued AI jobs would still run after a switch-off. | High (CEO directed AI to stay disabled) | `lib/config/flags.ts`, `lib/ai/provider.ts` at `ad51553` | `lib/ai/guard.ts` master switch (exact value `enabled`), second approval for external providers, guard checked on every call, flags are getters, stale queued jobs are no-ops, compose files pin `disabled`, `/api/v1/health` reports state | `tests/unit/aiMasterSwitch.test.ts` (10), `tests/integration/aiDisabled.test.ts` (4), `tests/e2e/52-ai-disabled.spec.ts` (runs on an AI-off stack) | **Fixed** |
| F-2 | Public health endpoint echoed raw driver error text when a dependency was down (could expose hostnames/ports) | Low | `app/api/v1/health/route.ts` | returns `"unavailable"` only; stack/driver text stays in server logs | covered by existing health E2E; behaviour change is output-only | **Fixed** |
| F-3 | Offsite backup key can delete offsite backups; bucket keeps all versions forever (no retention); dumps contain plaintext integration webhook secrets | High | `docs/disaster-recovery.md` §9 (finding dated 2026-10-04; not re-verified, needs B2 account) | recommendation in `04` (writeFiles-only key, lifecycle rule, optional client-side encryption) — **not applied** (live storage change needs approval) | n/a | **Open** |
| F-4 | `GET /usage/summary` had no permission check | Medium | route code | gated by `BILLING_VIEW` (CEO, manager, client) | `39-supervisor-cto`, `43-billing` E2E | **Fixed** (commit `50834e3`) |
| F-5 | No error-tracking service; no paging | Medium | `SENTRY_DSN` unused, no pager integration | in-app alerts routed by role, optional SMTP email (built); Sentry/paging need an account | `alertRouting`, `emailChannel` tests | **Open** (provider accounts) |
| F-6 | Production backups never restored in a drill | High | no evidence | local drill script with integrity checks (PASS locally, `04-backup-restore-test-report.md`); production drill needs a real dump | `scripts/restore-drill.sh` | **Open** |
| F-7 | Integration tests were order/parallelism dependent | Low | intermittent failures on global counts | files run serially (`vitest.config.ts`) | three consecutive clean runs | **Fixed** |
| F-8 | One unexplained E2E setup failure | Low | single occurrence, not reproduced | wait-out of the app's own write limit in the seeding helper (suspected cause) | later full runs clean | **Accepted / watch** |

No Critical finding was identified. **No finding was left unreported to preserve a "ready" status.**

## 2. SLA assignment expiry and queue reliability (5.1)

**Is the loop still present? No.** The earlier defect (one demo conversation produced 5,400+ `assignment.expired` audit rows because an unanswered assignment expired and was reassigned forever) was fixed in commit `b5c43eb`, and this audit re-verified the fix:

- Trigger and sequence (historic): SLA timeout → `expireAssignment` → `tryAssignConversation` picks an operator → assignment created → nobody replies → timeout again → … unbounded.
- Current behaviour (`lib/assignment/engine.ts`, `lib/assignment/slaCap.ts`): expiry is a **conditional update** (`status: ACTIVE → EXPIRED`) so a duplicate/concurrent job is a no-op; the number of *consecutive* `sla_timeout` expiries is **derived from persisted assignment rows** (no in-memory counter, so it survives restarts); after **5** (`SLA_MAX_CONSECUTIVE_EXPIRIES`, bounded 1–50, strict parsing) automatic reassignment **stops**: the conversation moves to `EXPIRED`, exactly **one** `conversation.sla_escalated` audit row and one `SystemEvent` are written, and it appears in the manager's "needs attention" list until a manager resumes it (`POST /conversations/[id]/resume`) or the customer writes again. An operator reply or a manual reassignment breaks the chain. Realtime clients are not told (internal operations data).
- Event-storm bound: at most 5 expiry rows + 1 escalation row per attempt chain.

| Required scenario | Evidence |
|---|---|
| Normal assignment and expiry; reassignment below the cap | `tests/integration/slaCap.test.ts` "below the cap … reassigned as before" |
| No eligible operator | `queue` sweep re-tries QUEUED/REASSIGNING every 15 s; `tests/e2e/03`, `04`, `31` (language not covered stays queued) |
| Worker restart during processing | "the cap is derived from the database, not process memory (survives a worker restart)"; BullMQ redelivers unacked jobs (E2E `09`) |
| Duplicate events | "re-expiring is a no-op (no duplicate escalation, no audit growth)" |
| Concurrent workers | "concurrent workers expiring the same assignment: one expiry, one audit row, one escalation"; capacity race: `operatorCapacityRace` |
| Exhausted retries → manager escalation | "at the cap … exactly ONE escalation (audit + SystemEvent)"; E2E `26` |
| Demo-like history (thousands of past expiries) | "demo-like history … the next expiry caps immediately" |
| Manager resume gets fresh attempts | "a manager can resume it …" |
| Tenant boundaries | needs-attention and resume are tenant-scoped (E2E `26`, `32`) |
| Temporary Redis/DB failure | **Partially verified:** `/health` fast-fails on Redis loss (fault-injected in an earlier session, `docs/GCO_FINAL_V1_READINESS_AUDIT.md`); BullMQ reconnection relied on, **not re-injected in this session** — NOT TESTED here |

Additional protections added since: transfers and shift preferences never create expiry events; the periodic sweep only assigns, it does not write audit rows.

## 3. Authentication and authorization (5.2)

- **Server-side checks everywhere:** a structural test walks all 162 handlers and fails if one lacks a caller check unless it is on a short exempt list with a reason (login/logout/refresh/accept-invitation, health, two public website forms, two HMAC-signed client feeds, three staging-only routes that answer 404 outside staging). `tests/unit/apiRouteAccessChecks.test.ts` (193 cases). A second manual pass over routes that only call `getSession` found only own-account routes and the escalation service (checks inside).
- **Role matrix:** exact permission lists for SUPERVISOR and CTO are pinned by a test; neither can touch money, sales, onboarding, account management or conversation content (CTO).
- **Tenant scoping / IDOR:** `resolveTenantScope` pins CLIENT to its tenant and managers/supervisors/operators to theirs; cross-tenant ids return 404/403 in E2E for shifts, reports, training, knowledge, billing, requests, moderation, privacy, transfers, assignments, escalations (specs `05`, `20`, `39`–`51`). Supervisors are additionally limited to their own team (`teamScope`).
- **Sessions:** HS256 JWT (access) + hashed refresh tokens, revocation on logout/password change/anonymisation, realtime tickets are a different token type (E2E `07`, `11`); optional TOTP with replay protection (E2E `35`).
- **Financial/administrative operations:** rate cards, adjustments, payouts, invoices, privacy and AI-adjacent settings are CEO-only (`PAYOUT_MANAGE`, `BILLING_MANAGE`, `PRIVACY_MANAGE`); every change writes an audit entry with before/after.
- **Consistent denial:** forbidden = 403, foreign object = 404, errors never include stack traces (`handleRouteError` logs server-side).
- **Residual risk:** isolation is application-layer only (R-2). Frontend hiding is never relied on (tests call APIs directly).

## 4. API and webhook security (5.3)

| Control | Implementation | Evidence | Status |
|---|---|---|---|
| Signature validation | per-integration secret; `gco-webhook`: `X-GCO-Signature: v1=HMAC-SHA256(secret, "<timestamp>.<rawBody>")`, constant-time compare; missing secret fails closed (401) | unit `gcoWebhookAdapter`, E2E `02`, `18`, `25` | Verified (local) |
| Replay protection | `gco-webhook`: ±5-minute timestamp window; event-id dedup; the **dev-mock** adapter has no timestamp (non-production, refused in production) | unit tests incl. stale/future | Verified; dev-mock limitation documented |
| Secret rotation | secrets can be re-issued per integration; verification state cleared on rotation | E2E `19` | Verified (mechanism); no rotation schedule exists |
| Size/validation | 1 MB cap checked on `Content-Length` and body; schema validation before persistence; validation errors never echo payloads | E2E `18`, unit | Verified |
| Rate limiting | Redis fixed window per integration (3000/min), login 10/15 min, authenticated writes 120/min, public forms limited | integration `rateLimit`, `clientIpRateLimit` | Verified |
| Idempotency | unique `(tenant, externalMessageId, direction)`; webhook event dedup; usage record keyed by message | integration `webhookDedup`; E2E `02` | Verified |
| Timeouts, retries | outbound delivery with timeout, bounded retries (5, exponential), dead-letter queue, manager recovery | E2E `09`; integration `gcoWebhookDelivery` | Verified (dev-mock/test server) |
| Outbound HTTPS / SSRF | `lib/integrations/safeHttp.ts`: https only, no credentials in URL, default port only, no redirects followed, address check inside the connection's own DNS lookup (defeats rebinding), blocks loopback/private/link-local/metadata/CGNAT/multicast/reserved/IPv4-mapped IPv6 | unit tests incl. DNS-rebinding case | Verified |
| Tenant isolation of events and deliveries | integration → tenant resolved server-side; outbound adapter context carries tenant id | E2E `05`, `18`, `25` | Verified |
| Safe errors | generic messages, no secrets, no stack | code review + E2E | Verified |

The generic `gco-webhook` adapter is **not** an integration with WhatsApp, Instagram, SMS, email or any named platform. It is a documented, signed HTTP contract that a client must implement; no named-provider adapter exists or is claimed.

## 5. Secrets and sensitive data (5.4)

| Check | Result |
|---|---|
| Secrets in Git | `git grep` over HEAD for key patterns (OpenAI/AWS/GitHub tokens, private keys) found only deliberate fake fixtures in two test files; no `.env`-type file was ever added to history (`git log --diff-filter=A`) | 
| Env files excluded | `.gitignore` covers `.env`, `.env.*.local`, B2 credential file; tracked examples contain placeholders only |
| Prod/staging separation | staging has its own compose file, database, Redis index, `AUTH_SECRET`, AI off, simulator tools gated to staging (E2E `37`/`38`); staging was **built and run locally**, not deployed |
| Redaction in logs | pino logger; searched all `logger.*` calls: no message content or email addresses are logged on the request path; AI errors log category only; the email channel masks addresses in failure logs |
| Debug endpoints | none expose configuration; `system-health` is authenticated (CEO/manager/assistant/CTO); public health returns booleans, latency, environment name and AI mode |
| Backups | private bucket, server-side encryption, scoped key; **dumps contain plaintext integration webhook secrets** (accepted risk, F-3) |
| No secret dumping | no environment values were printed or written to any report in this work |

## 6. Dependencies and application security (5.5)

- `npm audit --omit=dev`: 0 vulnerabilities (earlier in this engagement a critical Next.js advisory and two high advisories were fixed with in-range updates: Next 16.4.2, sharp 0.35.5, source-map-js 1.2.2). No major-version upgrade was performed.
- Added dependencies this session: `nodemailer` (optional email channel) and, for tests only, `smtp-server` and type packages. They were not separately licence- or supply-chain-audited beyond `npm audit`.
- Not run: SAST/secret-scanning services, container image scanning (no Docker), licence scanning — **NOT TESTED**.

## 7. Unresolved risks (prevent a "ready" claim)

1. Real client integration unproven (R-1).
2. Production backup restore not drilled; offsite key over-privileged; no remote retention (R-3, R-4).
3. Docker/CI/production deployment unverified from here.
4. No third-party penetration test or security review.
5. No error tracking or paging.
6. Legal review of data handling and retention pending.

## 8. Recommended follow-up (priority order)

1. Replace the B2 key with a write-only-files key and add a 30-day remote lifecycle (account owner, approval).
2. Restore a real production dump into an isolated container and run `scripts/restore-drill.sh` checks against it.
3. Verify Docker build and the staging compose on a Docker host.
4. Obtain the first client's API specification and sandbox; complete the acceptance checklist.
5. Arrange an external security review before any client with sensitive data.
6. Add error tracking/paging once an account exists.
