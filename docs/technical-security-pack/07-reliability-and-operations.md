# 07 — Reliability and operations

No availability percentage, RPO/RTO or service-level commitment is offered or implied. Figures marked "local" were measured on a development laptop and do not describe production.

| Area | What exists | Evidence | Status |
|---|---|---|---|
| Health checks | public `GET /api/v1/health` (database, Redis, environment name, AI mode; no error details); authenticated `system-health` (queue counts, recent errors); container healthchecks for web, realtime, Postgres, Redis | E2E; this audit | Verified (local) |
| Queue processing | BullMQ workers, concurrency per queue, 15-second sweep for stuck QUEUED conversations | E2E `03`, `04`, `09` | Verified (local) |
| Retry and dead letter | 5 attempts with exponential backoff; failures land in a dead-letter queue; CEO/assistant can requeue | E2E `09` | Verified (local) |
| SLA expiry and escalation | bounded reassignment (cap 5), manager attention list and resume | integration `slaCap`, E2E `26` | Verified |
| Load behaviour | **local** run: 3 000 messages at 1 000/min over 3 minutes and a 100-at-once burst: all persisted, ack latency p99 31 ms / 170 ms; no soak > 3 min, no production topology | `../load-testing.md` | Partially verified |
| Monitoring and alerting | in-app alerts (SLA, queues, coverage gaps, no operator online), routing by role and severity, optional email; uptime monitor owned by the CEO (state unverified); **no pager, no error tracking** | tests | Partially implemented |
| Backups and restoration | nightly dump + offsite copy documented; restore script and local drill passed; production restore not drilled | `../readiness/04-*` | Partially verified |
| Deployment and rollback | manual `docker compose` procedure documented; staging definition exists; Docker not verified here | `09`, `../deployment.md` | Documented, not verified |
| Incident response | `../client-incident-process.md` and recovery runbooks; **no written breach-notification procedure or on-call rota** | docs | Partially implemented |
| Operational ownership | CTO operates; single points of failure on accounts (CEO owns most) — see `../readiness/08` | docs | Open |

Operational limits to state plainly: single server with one instance of each service; failure of the server means downtime until rebuilt from backup; recovery point is up to about a day; Redis queue state is not persisted across a full loss.
