# 09 — Go-live checklist

**Status key:** PASS = verified with evidence · FAIL = tested and failed · BLOCKED = external dependency, access or approval missing · NOT TESTED = not yet verified · NOT APPLICABLE = justified.
**Date:** 2026-10-20 · Evidence runs: local stack (PostgreSQL 16, Redis, mock/disabled AI, dev-mock adapter). **A client launch is BLOCKED** while any critical item below is not PASS (rule from the brief).

## Application
| Item | Status | Evidence / note |
|---|---|---|
| Build | PASS | `next build` succeeded on the current tree (local stack built and started) |
| Type check | PASS | `npm run typecheck` exit 0 |
| Lint | PASS | `npm run lint` exit 0 |
| Unit tests | PASS | 47 files, 720 passed |
| Integration tests | PASS | 34 files, 216 passed (serial, real PostgreSQL/Redis) |
| End-to-end tests | PASS | AI-on (mock opt-in) stack: **285 passed, 5 skipped** by design (2 staging-only, 3 AI-off specs); AI-off stack: **286 passed, 2 failed, 2 skipped** — the 2 failures are the specs that test AI features themselves (`01` suggestion step, `08` memory), expected and documented |
| Database migration compatibility | PASS (local) | 29 migrations apply to a clean database and a restored copy reports "up to date"; **production migration NOT TESTED** |
| Authentication and authorization | PASS | E2E `06`, `07`, `16`, `35`, `39`; route-guard test (193 cases) |
| Tenant isolation | PASS (application layer) | E2E `05` and specs `39`–`51`; restore integrity checks for tenant consistency |
| Core CRM and operator workflows | PASS (simulated client) | E2E `13`–`16`, `23`, `24`, `27`, `28`, `01`–`04`, `20`, `26` |

## Reliability
| Item | Status | Evidence / note |
|---|---|---|
| Queue processing and SLA behaviour | PASS | integration `slaCap` (9), E2E `03`, `04`, `26` |
| SLA expiry loop cannot recur | PASS | regression tests incl. concurrency, restart, duplicates, demo-like history (`02` §2) |
| Retry and dead-letter handling | PASS (test double) | E2E `09`; real provider NOT TESTED |
| Health checks and alerts | PASS (health) / PARTIAL (alerts) | `/health` verified; alert routing tested; **no paging, no error tracking** |
| Redis/database outage recovery | NOT TESTED in this audit | earlier fault injection documented; not repeated |
| Backup restoration | PARTIAL | local drill PASS (`04-backup-restore-test-report.md`); **production dump restore NOT TESTED** |
| Recovery documentation | PASS (exists) / NOT TESTED (full rebuild drill) | `docs/disaster-recovery.md`, `04` |
| Load behaviour | PARTIAL | local 3-minute sustained + burst PASS; soak/production topology NOT TESTED |

## Security
| Item | Status | Evidence / note |
|---|---|---|
| Secrets and environment separation | PASS (repository) / NOT TESTED (server) | history scan clean; staging/production separation defined; server not inspected |
| Webhook verification | PASS | `gco-webhook` unit and E2E tests |
| SSRF and outbound restrictions | PASS | `safeHttp` tests incl. DNS rebinding |
| Sensitive-data logging | PASS (code review) | no content logged on request path; health no longer echoes driver errors |
| Dependency findings | PASS | `npm audit --omit=dev`: 0 vulnerabilities (licence/container scans NOT TESTED) |
| **AI remains disabled** | **PASS** | master switch default off; compose pins; unit + integration + E2E (`52`); health reports `disabled` |
| Third-party security review | NOT TESTED | none performed |
| Offsite backup key privileges | **FAIL (documented finding B-1)** | key can delete offsite backups — needs account owner |

## Operations
| Item | Status | Evidence / note |
|---|---|---|
| Staging validated | PARTIAL | local second stack validated (`03-staging-validation.md`); **server staging and Docker NOT TESTED / BLOCKED** (approval + Docker host) |
| Deployment and rollback documented | PASS (documented) / NOT TESTED (rollback drill) | `09` pack document, `docs/recovery-runbook.md` |
| Access ownership agreed | BLOCKED | `07`, `08` — CEO/CTO/legal coordination |
| Incident escalation documented | PARTIAL | `docs/client-incident-process.md`; no breach-notification procedure or on-call rota |
| Infrastructure budget reviewed | BLOCKED | `05` — needs invoices/quotes; CEO review |
| Email migration plan reviewed | BLOCKED | `06` — CEO review and decision |
| Data retention approved | BLOCKED | provisional 30 days / 6 months pending legal review; job not activated |
| Scheduled jobs installed on the server | BLOCKED | units written (`deploy/systemd`), installation needs approval |

## Client integration (all for the first real client)
| Item | Status |
|---|---|
| Actual provider documentation received | **BLOCKED** |
| Credentials securely configured | **BLOCKED** |
| Permissions reviewed | **BLOCKED** |
| Data mapping and tenant isolation tested | NOT TESTED (dev-mock only) |
| Inbound/outbound behaviour validated | NOT TESTED (dev-mock only) |
| Failure and retry scenarios tested | NOT TESTED against the client (PASS against test doubles) |
| Client acceptance criteria passed | **BLOCKED** |
| Production launch explicitly approved | **BLOCKED** (CEO) |

## Verdict
**NOT READY FOR CLIENT LAUNCH.** Ready for review and for controlled acceptance testing against the simulator. Critical blockers: real client integration, production restore drill, offsite backup key, server/Docker/staging verification, legal and retention approvals, access ownership.
