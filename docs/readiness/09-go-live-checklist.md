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
| Integration tests | PASS | 34 files, 217 passed (serial, real PostgreSQL/Redis) |
| End-to-end tests | PASS | AI-on (mock opt-in) stack: **296 passed, 5 skipped** by design (2 staging-only, 3 AI-off specs); AI-off stack: **297 passed, 2 failed, 2 skipped** — the 2 failures are the specs that test AI features themselves (`01` suggestion step, `08` memory), expected and documented. Includes the 11-step simulated client acceptance test (`53`). |
| Database migration compatibility | PASS (local) | `scripts/migration-check.sh`: all 29 migrations apply to an **empty** database and the result matches `prisma/schema.prisma` exactly (no drift; the check was shown to fail on an empty database, exit 2); a restored copy reports "up to date"; **production migration NOT TESTED** |
| Authentication and authorization | PASS | E2E `06`, `07`, `16`, `35`, `39`; route-guard test (193 cases) |
| Tenant isolation | PASS (application layer) | E2E `05` and specs `39`–`51`; restore integrity checks for tenant consistency |
| Full simulated client acceptance test | PASS (simulated) | `13-simulated-client-acceptance-test.md`: 11 of 11 steps; defects found and fixed; **not a real-client test** |
| Core CRM and operator workflows | PASS (simulated client) | E2E `13`–`16`, `23`, `24`, `27`, `28`, `01`–`04`, `20`, `26` |

## Reliability
| Item | Status | Evidence / note |
|---|---|---|
| Queue processing and SLA behaviour | PASS | integration `slaCap` (9), E2E `03`, `04`, `26` |
| SLA expiry loop cannot recur | PASS | regression tests incl. concurrency, restart, duplicates, demo-like history (`02` §2) |
| Retry and dead-letter handling | PASS (test double) | E2E `09`; real provider NOT TESTED |
| Health checks and alerts | PASS (health) / PARTIAL (alerts) | `/health` verified; alert routing tested; **no paging, no error tracking** |
| Redis/database outage recovery | NOT TESTED in this audit | earlier fault injection documented; not repeated |
| Backup restoration | PARTIAL | local drill PASS (`04-backup-restore-test-report.md`); a ready-to-run, safety-checked procedure and script for a real dump exist (`11-production-restore-runbook.md`, `scripts/restore-production-dump.sh`, exercised on a local dump file); **production dump restore NOT TESTED** (needs the dump and CEO approval) |
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
| Access ownership agreed | BLOCKED | `07`, `08`, `12` — GitHub organization transfer runbook and ownership-agreement checklist written; CEO + CTO + lawyer must act |
| Incident escalation documented | PARTIAL | `docs/client-incident-process.md`; no breach-notification procedure or on-call rota |
| Infrastructure budget reviewed | PARTIAL | `05` §0 — CEO-confirmed figures: ≈ €97–€101 of €150 before VAT; domain, UptimeRobot/Calendly, VAT regime and invoices still to confirm |
| Email migration plan reviewed | PARTIAL | CEO approved (no history, both mailboxes verified before Zoho off, CEO super admin); execution steps in `14`; waiting for the CEO's accounts and a cut-over window |
| Legal drafts (privacy notice, DPA, term sheet, confidentiality, retention, transfers) | PARTIAL | written as unreviewed drafts in `docs/legal-drafts/`; **review required for DPA and transfer policy**; fictional data only until then |
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
