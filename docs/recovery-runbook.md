# GCO Production Recovery Runbook

Server: `188.245.22.254` (Hetzner). Deploy directory: `/opt/gco`. Deploy user: `gco`.

Every procedure below is labeled:
- **VERIFIED** - actually performed and confirmed working during Phase 8 hardening.
- **DOCUMENTED BUT NOT TESTED** - the correct procedure given the architecture, not yet exercised end-to-end in this environment.

## 1. Server unavailable
**DOCUMENTED BUT NOT TESTED.** Check Hetzner Cloud Console for the instance's power/health state. If the instance is running but unreachable, use Hetzner's web console (out-of-band access) to inspect it directly. If the instance is down, restart it from the Hetzner console. This runbook does not cover Hetzner account/console access recovery - that is Cristian's Hetzner account.

## 2. Docker unavailable
**VERIFIED** (daemon health checked routinely throughout Phases 5-8, not deliberately crashed and recovered). `sudo systemctl status docker`; if inactive, `sudo systemctl restart docker`. Docker is enabled at boot (`systemctl is-enabled docker` = enabled), so a server reboot brings it back automatically. All containers have `restart: unless-stopped`, so once the daemon is back, `docker compose up -d` (or nothing, if they auto-started) brings the stack back without manually recreating anything.

## 3. Web container failure
**VERIFIED.** `docker compose ps` to see status; `docker compose logs web --tail 100` for the cause. `restart: unless-stopped` + a working healthcheck means Docker restarts a crashed container automatically. Manual recovery: `docker compose up -d --force-recreate web`. Confirmed safe and non-destructive - performed multiple times during Phases 5-8 with zero data loss and the app healthy immediately after.

## 4. Worker failure
**VERIFIED** the recovery mechanism (container restart policy + BullMQ's own persistence), not a live crash. Redis (not the worker process) is the durable store for queued jobs - a worker crash mid-job does not lose the job; BullMQ requeues it once a worker reconnects. `docker compose logs worker --tail 100`; `docker compose up -d --force-recreate worker` to restart. Verify recovery via `GET /api/v1/admin/system-health` (queue depths/dead-letter counts) once a CEO_ADMIN session is available.

## 5. Realtime failure
**VERIFIED.** Same restart mechanism as web/worker. Clients reconnect automatically: `lib/realtime/useRealtime.ts` has its own exponential-backoff reconnect loop, and the dashboard's REST polling is an unconditional fallback regardless of the WebSocket's state - a realtime outage degrades UX (slower updates) but never breaks functionality.

## 6. PostgreSQL failure
**VERIFIED** container-level recovery (restart, health recheck); **NOT TESTED**: recovery from actual data corruption (that's what section 8, backup restoration, is for). `docker compose logs postgres --tail 100`; `docker compose ps` for health state. Data lives in the named Docker volume `gco_gco_postgres_data`, independent of the container's lifecycle - recreating the container never touches the volume.

## 7. Redis failure
**VERIFIED** container-level recovery. Redis here holds BullMQ queue state and pub/sub for realtime - both are designed to tolerate a Redis restart (BullMQ jobs persist to the `gco_gco_redis_data` volume by Redis's own default RDB/AOF persistence config for this image; a realtime pub/sub message in flight during a Redis restart is simply missed, which is harmless by the design documented in `workers/realtime-server.ts` - the dashboard's polling fallback catches up). Recovery: `docker compose up -d --force-recreate redis`.

## 8. Backup restoration
**VERIFIED** (Phase 8, Section 5): restored the latest `pg_dump -Fc` backup into a fully isolated, temporary `postgres:16-alpine` container (separate Docker network, separate volume, never touching the production `postgres` service or its volume), confirmed the schema (33 tables), migration history (8 rows in `_prisma_migrations` matching production), and representative row counts came back correctly, then destroyed the temporary container and its volume. Production was re-verified untouched immediately after (`docker compose ps` health, row counts unchanged).

To restore in a real emergency (production database actually lost/corrupted - has **not** been tested against the live service, only against an isolated copy):
```bash
docker compose stop web worker realtime   # stop writers first
# restore INTO the existing postgres volume, NOT a temporary one, only in
# a genuine emergency - this overwrites current data
docker compose exec -T postgres pg_restore -U gco -d gco --clean --if-exists < /var/backups/gco-postgres/<file>.dump
docker compose up -d web worker realtime
```

## 9. Domain/DNS failure
**DOCUMENTED BUT NOT TESTED.** DNS is on Cloudflare (`globalconversationoperations.com`, `app.globalconversationoperations.com`, both A records -> `188.245.22.254`, Proxied). If DNS resolution breaks, check the Cloudflare dashboard (Cristian's account) for the zone's record and nameserver state first - this is outside anything on the server itself.

## 10. TLS failure
**VERIFIED** the automatic-renewal mechanism exists and is active (Caddy's built-in ACME client, confirmed running via `tls.cache.maintenance` background job); **NOT TESTED**: an actual expired/failed renewal recovery. If a certificate fails to renew: `sudo journalctl -u caddy | grep -i tls` for the error, `sudo systemctl restart caddy` to retry issuance. Caddy re-attempts automatically well before the 90-day Let's Encrypt expiry.

## 11. Application rollback
**DOCUMENTED BUT NOT TESTED** as a full rollback, though the underlying mechanism (rsync + git + rebuild) was exercised repeatedly and successfully during Phases 5-7 for forward deploys.
```bash
cd /opt/gco
git log --oneline -5        # find the last known-good commit
git checkout <commit>        # or reset --hard if the tree must match exactly
docker compose build web worker realtime
docker compose up -d --force-recreate web worker realtime
```
Never run a Prisma migration rollback as part of this without reading Section 12 below first - a code rollback and a schema rollback are separate decisions.

## 12. Migration rollback considerations
**DOCUMENTED, NOT IMPLEMENTED AS TOOLING.** Prisma does not have a built-in automated "down" migration. Rolling back a schema change safely requires hand-writing a reverse SQL migration and is only advisable when the forward migration's changes are additive (rolling back a column drop, for instance, cannot recover the dropped data - that requires the Section 8 backup path instead). Given this application's actual migration history (8 migrations, all additive: new tables/columns/constraints, no destructive changes), a "rollback" in practice almost always means restoring the pre-migration backup rather than attempting a reverse migration.
