# Emergency Recovery

Available to CEO_ADMIN and ASSISTANT roles (permission `QUEUE_RECOVER` / `EMERGENCY_ACTIONS`), gated by `FEATURE_EMERGENCY_CONTROLS`.

## Actions implemented in V1

| Action | Endpoint | Effect |
|---|---|---|
| Requeue a dead-letter job | `POST /admin/recovery/requeue-dead-letter { jobId }` | Re-submits the job to its original queue with its original data, removes it from dead-letter |
| Manual conversation reassignment | `POST /assignments/:id/reassign { reason }` | Cancels current assignment, requeues, immediately attempts reassignment |
| Inspect system health | `GET /admin/system-health` | DB/Redis/queue status, recent errors |
| Inspect audit trail | `GET /admin/audit-logs` | Full sensitive-action history |

Every action is authenticated, authorized via `requirePermission`, and recorded via `writeAuditLog` with actor, target, timestamp, and result - per spec section 27.

## Worker recovery

No manual action needed for the common case. A crashed/restarted worker process loses no in-flight work: BullMQ only marks a job complete after its processor function returns, so a job the worker was mid-processing when it died is automatically redelivered to the next worker instance that starts (this is inherent to the queue design in `docs/queue.md`, not a separate recovery feature - see `docker-compose.yml`'s `restart: unless-stopped` on the `worker` service for how a crashed container comes back automatically in production). What *does* need a human: a job that's failed and permanently exhausted its retries lands in dead-letter (above), because retrying it blindly forever could be actively harmful (see "What is intentionally NOT automated" below).

## Failed integration recovery

`Integration.status` supports `ACTIVE`/`DEGRADED`/`DISABLED`. Today this is read (webhooks to a non-`ACTIVE` integration are rejected with 404 - see `app/api/v1/webhooks/[integrationId]/route.ts`) but there is no dedicated admin endpoint yet to *set* it beyond direct database access — tracked below as a known gap, not something to represent as built.

## What is intentionally NOT automated

Dangerous non-idempotent operations (e.g. blind infinite retry of outbound sends that might have actually succeeded on the client's side) are not auto-retried indefinitely - `outbound-delivery` jobs cap at 5 attempts with backoff, then land in dead-letter for a human to review before manual requeue. This avoids double-sending a message to an end user.

## Planned, not yet built (Phase 2 candidates)

- Pause/resume a queue from the UI (the primitive exists in BullMQ - `queue.pause()`/`queue.resume()` - but is not yet exposed via an API route or UI control).
- Disable an unhealthy integration from the UI (the `Integration.status` field supports `DEGRADED`/`DISABLED` today; no dedicated endpoint yet - update via `admin/tenants`-style CRUD once built).
