# Deployment

## Local development

```bash
cp .env.example .env        # fill in AUTH_SECRET at minimum (openssl rand -base64 48)
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run seed                 # optional demo data, clearly labeled [DEMO]
npm run dev                  # web on :3000
npm run worker:dev            # separate terminal - queue workers
npx tsx workers/realtime-server.ts   # separate terminal - realtime WS on :3001
```

## Production (Docker)

```bash
docker compose up -d --build
```

This starts Postgres, Redis, the `web` container, and a `worker` container from the same image (see `Dockerfile`, multi-stage Next.js standalone build). The realtime server is not yet included in `docker-compose.yml` as a separate service - add a third container from the same image running `node workers/realtime-server.js` before going live (tracked as a known gap, see `docs/decisions.md`).

**Status**: `next.config.js` now sets `output: 'standalone'` (a prior gap meant `docker build` would have failed at the `COPY .next/standalone` step - never caught because Docker wasn't available in the environment this was first built in) and a `.dockerignore` now excludes `.env*`/`.git`/`node_modules` from the build context (a prior gap meant a local `.env` could get baked into the image - see `docs/production-readiness-audit.md`). `npm run build` + `npm run start` (the non-containerized equivalent of what the Docker image runs) have been verified to work end-to-end. **The actual `docker build`/`docker compose up` commands themselves have still not been executed** - Docker is not available in this development environment. Run them yourself before trusting the container image; the Dockerfile has been code-reviewed and its assumptions verified indirectly, but not run.

Before first boot in any new environment:

```bash
npx prisma migrate deploy
```

## Health checks

- `GET /api/v1/health` - liveness/readiness (checks DB + Redis), no auth required. Point your orchestrator's health check here.
- `GET /api/v1/admin/system-health` - authenticated, richer view (queue depths, recent errors) for the admin System Health screen.

## Operational assumptions (be honest about what "24/7" means here)

This V1 architecture is designed to survive: a single worker crash (BullMQ redelivers), a temporary AI provider outage (suggestions fail gracefully), a temporary client-API outage (outbound delivery retries with backoff), and duplicate webhook deliveries. It does **not** yet include: multi-region failover, automated database backups/PITR configuration, or a load balancer/autoscaling config - those are infrastructure choices for the hosting provider and must be configured explicitly before claiming continuous 24/7 operation. Configure them (managed Postgres with automated backups, a process supervisor or orchestrator that restarts crashed containers, log/metric shipping) before relying on this in production.

## Rollback

- `npx prisma migrate deploy` is forward-only by design; to roll back a bad migration, write and deploy a new down-migration rather than editing history.
- Container images are tagged per build; rolling back the `web`/`worker` containers to the previous tag is safe as long as no destructive migration was applied in between.

## Backups and restore

**Status: procedure documented below, NOT drilled/tested in this project.** A backup strategy nobody has ever restored from is unverified by definition - schedule an actual restore drill before relying on this.

- **PostgreSQL is the only thing that needs backing up.** It is the sole source of truth for every business record - conversations, messages, assignments, usage ledger, audit logs (see `docs/decisions.md` "Airtable is not the source of truth"). Redis holds only the queue, rate-limit counters, and pub/sub state - all disposable; a Redis data loss loses in-flight jobs (recoverable by re-sending the original webhooks, since `WebhookEvent` rows persist independently in Postgres) but no business data.
- **Backup**: use your PostgreSQL provider's automated continuous backup / point-in-time recovery (PITR) — not built into this repo since the mechanism is entirely provider-specific (managed RDS/Cloud SQL snapshot schedule, `pg_basebackup` + WAL archiving for self-hosted, etc.). At minimum, daily full backups with PITR granularity for anything more precise than "restore to yesterday."
- **Restore procedure** (generic — adapt to your provider):
  1. Provision a new Postgres instance (or use your provider's point-in-time restore feature directly) from the desired backup/timestamp.
  2. Point a *staging* `DATABASE_URL` at the restored instance and run `npx prisma migrate deploy` to confirm the schema matches what the app expects (a backup taken before a migration was applied will be behind — this step surfaces that immediately).
  3. Smoke-test against staging: `GET /api/v1/health`, log in, load a dashboard, confirm data looks sane for the expected restore point.
  4. Only then repoint production's `DATABASE_URL` (and restart `web`/`worker` containers to pick it up) — this is a deliberate, manual cutover, not automated, so a bad restore doesn't propagate silently.
  5. Redis needs no restore step — the worker's queues start empty and the periodic sweep (`workers/index.ts`) plus any client webhook retries repopulate the ingest queue from `WebhookEvent` rows if needed.
- **What's NOT covered**: cross-region failover, automated restore testing/game-days, a documented RTO/RPO target — these are commitments to make explicitly with whoever owns production infrastructure, not something to assume from this document alone.
