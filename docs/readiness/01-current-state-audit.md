# 01 — Current-state audit (baseline)

**Date:** 2026-10-20 · **Commit audited:** `ad51553` (HEAD at the start of this work) · **Method:** repository inspection plus checks executed in this session on a local stack (PostgreSQL 16, Redis, Next.js build, BullMQ worker, realtime server, dev-mock client adapter, mock AI). Earlier reports (`docs/GCO_*`, `docs/gco-phase-*`) were read as leads only; every statement below is either backed by an executed check or labelled otherwise.

Status vocabulary (used in every readiness document): **Verified** · **Implemented, not verified** · **Partially implemented** · **Planned** · **Blocked**.

## 1. Baseline test evidence (clean checkout of `ad51553`, no uncommitted changes)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm test` | 46 files, **709 passed**, 0 failed |
| Integration tests (real PostgreSQL/Redis) | `npm run test:integration` | 33 files, **212 passed**, 0 failed |
| Dependency audit | `npm audit --omit=dev` | **0 vulnerabilities** (production dependencies; tool: npm 11 audit; scope: `package-lock.json`; limitation: advisory database only, no licence or malware scan) |
| Migrations | `npx prisma migrate status` | 29 migrations, "Database schema is up to date" (local DB) |
| End-to-end (real HTTP) | `npx playwright test` | re-run after this work's changes: 285 passed / 5 skipped (AI-on stack) and 286 passed / 2 expected AI-feature failures (AI-off stack) — see `09-go-live-checklist.md` |

Not executable here, therefore **NOT TESTED**: Docker build/run (no Docker on this machine), the GitHub Actions workflow (no run history available), anything on the production server.

## 2. Architecture as implemented

| Layer | Implementation | Status |
|---|---|---|
| Web app | Next.js 16 App Router, React 18, Tailwind; 38 pages, **162 API route handlers** (`app/api/v1/**/route.ts`) | Verified (build + E2E) |
| Database | PostgreSQL via Prisma 5; **60 models, 29 migrations** | Verified locally |
| Queues | BullMQ on Redis: 8 queues (message ingest, AI suggestion, memory extraction, outbound delivery, assignment timeout, analytics, BPO handoff, dead letter); one worker process (`workers/index.ts`) plus periodic sweeps | Verified locally (E2E `09`, `26`) |
| Realtime | standalone WebSocket server (`workers/realtime-server.ts`), 30-second single-purpose tickets | Verified (E2E `11`) |
| Auth | custom HS256 JWT access token + refresh-token sessions, bcrypt (cost 12), optional TOTP 2FA with recovery codes | Verified (E2E `07`, `35`) |
| Authorization | role matrix `lib/auth/rbac.ts` (8 roles: CEO_ADMIN, MANAGER, SUPERVISOR, ASSISTANT, OPERATOR, CLIENT, HUNTER, CTO), tenant scoping `lib/auth/tenantGuard.ts`, team scoping for supervisors | Verified (E2E `05`, `06`, `16`, `39`) |
| Tenant isolation | application-layer only (every query scoped by `tenantId`); **no PostgreSQL row-level security** — a known, accepted design decision, listed as risk R-2 | Verified at app layer; RLS Planned/not adopted |
| Client integration | `IntegrationAdapter` boundary; registered adapters: `dev-mock` (non-production) and the generic signed `gco-webhook` | `gco-webhook`: Implemented, **not validated against any real client**; no named-provider adapter exists |
| AI | mock provider (default) and an OpenAI provider; **now behind a master switch that defaults to OFF** (see §6) | OFF; Verified (`aiMasterSwitch`, `aiDisabled`, E2E `52`) |
| Deployment | Dockerfile + `docker-compose.yml` (web, worker, realtime, postgres, redis), Caddy reverse proxy, Cloudflare in front, Hetzner Cloud server (Nuremberg), systemd timers for backups and jobs | Documented; **not verified in this session** (no server access, no Docker) |
| Observability | pino JSON logs, `SystemEvent` rows, in-app alerts + notifications, authenticated `system-health`, public `/api/v1/health`; no error-tracking service, no paging | Partially implemented |
| CI | `.github/workflows/ci.yml` (typecheck, lint, tests with Postgres/Redis services, build) | Implemented, **run history not verifiable** |

## 3. Workflow trace (entry → API → data → permissions → failure → tests)

| Workflow | Entry / API | Data | Permissions | Failure behaviour | Evidence | Status |
|---|---|---|---|---|---|---|
| Hunter lead creation and ownership | `/hunter`, `POST /api/v1/crm/leads` | `Lead`, `LeadHistoryEntry`, owner id | HUNTER (own leads), CEO/MANAGER (all) | duplicate detection by normalised email/company; ownership set server-side | E2E `13`, `16`, unit `leadOwnership` | Verified |
| 30-day lead lock and follow-up | worker lead sweep releases expired locks | `Lead.lockedUntil` | system | sweep errors logged, retried next tick | E2E `13` | Verified (lock release timing by test clock only) |
| Pipeline progression, Closed Won | `POST /crm/leads/[id]/stage` | `PipelineStage`, `Approval` | owner / manager approval for sensitive stages | approval required for Closed Won | E2E `14`, `28` | Verified |
| Payment confirmation → commission | `POST /crm/leads/[id]/confirm-payment` | `Commission` (server-calculated, % snapshotted), `RevenueRecord` | manager/CEO | retry does not duplicate; concurrent confirm → one commission | E2E `14` | Verified |
| Manual payout approval | CEO payout/approval routes | `Commission.status` | CEO | audit entry | E2E `14` | Verified for commissions; operator payouts have their own ledger (`earningsLedger` tests) |
| Client onboarding (from Closed Won) | worker `bpoHandoff` → `ClientOnboarding` → console, invitation, go-live | tenant, client user (inactive), invitation hash | CEO/assistant; go-live CEO only | provisioning idempotent; nothing active until explicit go-live | E2E `15`, `24`, `27`, integration `clientOnboarding`, `goLiveRace` | Verified (dev-mock only; no real integration activated) |
| Client setup wizard | `/admin/clients/new` | tenant, services, billing, rate card, invitations | CEO | validate-first, no partial creation on invalid input | integration `clientWizard`, E2E `44` | Verified |
| Operator onboarding / application | public `POST /public/careers/apply`, invitation flow, training gate | `CareerApplication`, `StaffInvitation`, `TrainingAssignment` | public form (rate limited); CEO for applications | spam/duplicate handling, 20 000-char cap | E2E `30`, `34`, `41` | Verified |
| Operator queue assignment | worker ingest → `tryAssignConversation` | `Assignment`, locked capacity check | system | race-safe (advisory lock), language routing, shift preference | integration `operatorCapacityRace`, `languageRoutingQa`; E2E `03`, `31`, `51` | Verified |
| SLA expiry and reassignment | timeout job → `expireAssignment` | `Assignment`, history, `SystemEvent` | system; manager resume | **bounded**: cap of 5 consecutive expiries (§5.1) | integration `slaCap` (9 cases), unit `slaCap`, E2E `26` | Verified |
| Supervisor review, escalation, client handoff | `/api/v1/escalations*` | `Escalation`, `EscalationEvent` | operator → supervisor/manager → CEO/assistant → client decision | content-isolated views per role | E2E `20`; integration `supervisorTeams` | Verified |
| Conversation lifecycle | resolve / reopen / history / search | `Conversation`, `Message`, `MessageEvent` | operator (own), manager | tenant-scoped 404 | E2E `32` | Verified |
| API/webhook intake and delivery | `POST /webhooks/[integrationId]`, outbound worker | `WebhookEvent`, `Message`, delivery status | per-integration HMAC | rejected before persistence if invalid; dedup; retries with backoff; dead-letter | E2E `02`, `18`, `25`, `09`; integration `webhookDedup`, `gcoWebhookDelivery` | Verified against dev-mock; **no real client** |
| Retention and deletion | admin Privacy screen, `runRetention`, erasure | `Tenant.messageRetentionDays` (null = off) | CEO | idempotent; billing/earnings kept | integration `privacy`, E2E `45` | Implemented and tested; **not activated** (§7, awaiting legal approval) |

Gaps that make some workflows **not end to end**: email notifications need an SMTP account (Implemented, not verified against a real provider); no named client platform adapter exists; moderation verdict delivery back to a client platform is Planned.

## 4. Findings summary (full detail in `02-security-and-reliability-audit.md`)

| ID | Finding | Severity | State |
|---|---|---|---|
| F-1 | AI feature flags defaulted to **ON** and provider defaulted to `mock`: with a default deployment, mock AI suggestions were generated and shown to operators; setting `AI_PROVIDER=openai` plus a key would have made live calls. A production key may exist on the server (`scripts/setup-openai-key.sh`). | High (contradicts CEO direction) | **Fixed** this session: master switch, default OFF |
| F-2 | `GET /api/v1/health` (public) echoed raw database/Redis driver error text on failure | Low | **Fixed** (generic "unavailable") |
| F-3 | Offsite backup key can delete offsite backups; no remote retention; dumps contain plaintext webhook secrets | High | Open — needs the account owner (documented, not changed) |
| F-4 | `GET /usage/summary` had no permission check | Medium | Fixed earlier in this engagement (commit `50834e3`) |
| F-5 | No error-tracking/paging; alerts are in-app/email only | Medium | Open (needs provider account) |
| F-6 | Restore of **production** backups never drilled (only a local database) | High | Open |
| F-7 | Docker, CI and production deployment not verified from here | Medium | Open |
| F-8 | Software ownership / GitHub administration unverified; repository on a personal account | High (business) | Open — approvals required |

Previously reported "SLA assignment expiry loop": **no longer present** (see §5.1 of `02`).

## 5. Test quality review

- **Skipped by design:** 2 E2E specs that run only on a staging stack (`37-staging`, `38-staging-absent` alternates).
- **Flaky history:** integration files used to share one database in parallel and fail intermittently on global row-count assertions; fixed by serial file execution (commit `47f3194`). One E2E setup failure occurred once and was not reproducible (three clean full runs since); suspected cause is the app's own 120-writes/minute limit on the shared admin seeding session; a wait-and-retry was added. **Unproven.**
- **Misleading risk:** E2E specs `01` and `08` need the mock AI. They now run only on a stack that opts in (`AI_MASTER_SWITCH=enabled`), and spec `52` runs only on a stack where AI is off, so both configurations are exercised.
- **Missing before this work:** a guard that every API route checks the caller (added: `apiRouteAccessChecks`, 193 cases), AI-off tests (added), restore integrity checks (added to the drill).

## 6. AI activation path (inspected)

Before: `lib/config/flags.ts` defaulted `FEATURE_AI_SUGGESTIONS` and `FEATURE_AI_MEMORY` to `true`; `lib/ai/provider.ts` defaulted to the mock and switched to the real OpenAI provider on `AI_PROVIDER=openai`. Ingestion enqueued AI jobs whenever the flag was on. After this work: nothing AI runs unless `AI_MASTER_SWITCH` is exactly `enabled`, an external provider additionally needs `AI_EXTERNAL_PROVIDER_APPROVED=yes`, the committed compose files pin the switch to `disabled`, and health reports the state. Details: `docs/technical-security-pack/08-ai-capabilities-and-restrictions.md`.

## 7. Pricing configuration and data retention (inspected)

- **Pricing:** client prices live on `Tenant` (per message / ticket / hour / monthly, VAT %), edited only by the CEO (`BILLING_MANAGE`, `TENANT_MANAGE`) with before/after audit entries; operator pay lives in effective-dated, append-only `OperatorRateCard` rows (CEO only) and each earning line snapshots its rate. System defaults (`DEFAULT_PRICE_PER_MESSAGE_EUR` 0.14, `DEFAULT_OPERATOR_COST_PER_MESSAGE_EUR` 0.06) are placeholders used only for newly created tenants. **€0.07 is not hardcoded anywhere** (searched code, schema, seed and docs); treat it as a provisional figure to enter as a rate card per client if and when approved. Historical records are untouched.
- **Retention:** nothing is deleted automatically today (`messageRetentionDays` is null for every client). The provisional policy (conversations 30 days, applicants 6 months) is **not configured**; the destructive job exists but is not scheduled. Where data also lives: `WebhookEvent.rawPayload`, `AiGeneration`/`AiMemory` (empty while AI is off), escalation text, notes, moderation content (all covered by the retention job), **database backups** (14 days local; offsite copies kept indefinitely — a retention exception that needs a decision, `06-data-lifecycle-and-privacy.md`), application logs (pino to Docker json-file, 10 MB × 3 per container; message content is not logged — searched), audit logs (ids and counts only, kept).

## 8. Risk register (top items)

| ID | Risk | Likelihood / impact | Mitigation / owner |
|---|---|---|---|
| R-1 | First client integration unproven (no spec, no sandbox) | certain / high | obtain spec; `04-api-integration-process.md` |
| R-2 | Tenant isolation relies on application code only (no row-level security) | low / critical | guard tests on every route; consider RLS as a later hardening |
| R-3 | Offsite backups deletable with the current key; no remote retention | medium / high | recommendation in `04`; needs account owner |
| R-4 | Production restore never exercised | medium / high | drill with a real dump (`04`) |
| R-5 | Single server, single instance of each service | medium / high | accepted for pilot; documented limits; no availability promise |
| R-6 | A production OpenAI key may exist on the server | low / medium | switch pinned off in compose; owner to confirm/remove key |
| R-7 | Ownership/IP and GitHub control not documented as agreed | medium / high | `07`, `08`; CEO + CTO + legal adviser |
| R-8 | Legal basis, retention periods and transfer terms unreviewed | certain / high | lawyer review before any client data |

## 9. Assumptions requiring confirmation

1. The production server matches `docs/deployment.md` and `docs/disaster-recovery.md` (not inspected here).
2. The nightly backup and B2 upload are still running (documented as active on 2026-10-04; no evidence refreshed).
3. GCO currently operates under the CEO's personal VAT registration and is **not** incorporated; that is taken from the CEO's instruction, not from the repository, and no legal or tax statement is made.
4. No client data exists in production yet (pilot stage).
5. Fiscozen is handling the legal/fiscal set-up; nothing in the repository references it.
