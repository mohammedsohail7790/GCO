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

## Backups

- Configure automated PostgreSQL backups (e.g. your managed Postgres provider's PITR) - not included in this repo since it is infrastructure/provider-specific.
