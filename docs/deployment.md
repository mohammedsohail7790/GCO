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

This starts Postgres, Redis, the `web` container, a `worker` container, and a `realtime` container, all from the same image (see `Dockerfile`, multi-stage Next.js standalone build).

**Status (re-audited this session, Docker still unavailable in this environment - findings below are from static review, not a real `docker build`/`docker compose up` run):**

Three concrete bugs were found by static review and fixed, none previously caught because Docker has never been runnable here:
1. `Dockerfile` did `COPY --from=builder /app/public ./public`, but no `public/` directory exists anywhere in this repo - `COPY` fails the whole build if its source doesn't exist. Fixed by adding an empty, tracked `public/.gitkeep`.
2. `docker-compose.yml`'s `worker` service ran `node workers/index.js` - that file is never produced anywhere (`tsconfig.json` has `noEmit: true`; the Dockerfile's build step only runs `next build`, not a workers compile step), so the worker container would have failed on every start. Fixed to run `npx tsx workers/index.ts`, the same way `npm run worker` already does in local dev (`tsx` ships as a devDependency but is present in the image because `npm ci` in the `deps` stage runs before `NODE_ENV=production` is set).
3. The realtime WebSocket server (`workers/realtime-server.ts`) was entirely absent from `docker-compose.yml` - previously the known gap this section used to describe. It now has its own `realtime` service using the same fix as #2.

A fourth, separate gap was also found and fixed: `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_REALTIME_URL` are compiled into the client bundle and into statically-prerendered pages at `next build` time - setting them only in the runtime `.env` that `env_file` passes to the `web` container has no effect on an already-built image. `docker-compose.yml`'s `web` service now passes them as `build.args` (read from compose's own `.env` file), and the `Dockerfile` declares matching `ARG`/`ENV` in the `builder` stage. Set real values before deploying to a real domain - left unset, they silently fall back to the `localhost` defaults.

`next.config.js` sets `output: 'standalone'`, and a `.dockerignore` excludes `.env*`/`.git`/`node_modules` from the build context. `npm run build` + `npm run start` (the non-containerized approximation of what the image runs) have been verified to work end-to-end, and the full migration/test suite passes against a real Postgres/Redis. **The actual `docker build`/`docker compose up` commands themselves have still never been executed anywhere this code has run** - Docker remains unavailable in every environment this project has been developed in. Run them yourself, end to end, before trusting the container image in production; everything above is from code review plus indirect verification (the same commands the image runs, run directly), not a real container build.

Before first boot in any new environment:

```bash
npx prisma migrate deploy
```

## Health checks

- `GET /api/v1/health` - liveness/readiness (checks DB + Redis), no auth required. Point your orchestrator's health check here. Confirmed by fault injection (killing Redis mid-run) to now report `503` within milliseconds rather than hanging - it previously used the same connection as BullMQ (`maxRetriesPerRequest: null`), which meant a Redis outage made this endpoint (and login, and every rate-limited route) hang indefinitely instead of degrading. Fixed in `lib/queue/connection.ts` by giving ad-hoc, non-queue Redis use (health check, rate limiter, realtime pub/sub) its own bounded-retry connection.
- `GET /api/v1/admin/system-health` - authenticated, richer view (queue depths, recent errors) for the admin System Health screen. Still uses the BullMQ-style connection (it reads real `Queue` objects) - a Redis outage can make this specific admin page slow rather than instant, which is an acceptable trade-off given it's a diagnostic screen an operator opens *because* something is already wrong, not a liveness probe.

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
