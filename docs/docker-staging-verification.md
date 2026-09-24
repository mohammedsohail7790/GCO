# GCO — Docker/Staging Verification

> **Docker runtime verification has NOT been performed in the development environment because Docker is unavailable there.** Everything in `Dockerfile`, `docker-compose.yml`, and this document has been produced by static review of the repository, plus indirect verification (running the equivalent commands directly outside a container — `npm run build`, `npm run worker`, `npx tsx workers/realtime-server.ts`, `npx prisma migrate deploy` against a real Postgres). **The procedures below must be executed for real on a Docker-capable machine before any of it is considered proven.**

This document is the handoff: everything a Docker-capable operator needs to actually run the verification this development environment could not.

---

## A. Prerequisites

- Docker Engine + Docker Compose v2 (the `docker compose` subcommand, not the standalone `docker-compose` v1 binary — `docker-compose.yml` here targets Compose spec `3.9`, which both support, but this doc's commands assume the v2 CLI).
- This repository, at the commit/working tree you intend to verify.
- A `.env` file in the repository root (see section B) — **not committed**, and not the real production `.env` if one exists elsewhere.
- Nothing else already bound to ports `3000`, `3001`, `5432`, `6379` on the host.
- Network access from the machine (to pull `node:20-alpine`, `postgres:16-alpine`, `redis:7-alpine`).

## B. Environment Variables

Copy `.env.example` to `.env` and fill in **test/staging values only** — never real production credentials:

```bash
cp .env.example .env
```

Minimum required for a meaningful run:

| Variable | Test/staging value | Notes |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_DB` | `gco` (defaults are fine) | |
| `POSTGRES_PASSWORD` | any random string, e.g. `openssl rand -base64 24` | **Required** — compose refuses to start postgres without it (`?POSTGRES_PASSWORD must be set in .env`) |
| `AUTH_SECRET` | `openssl rand -base64 48` | Required for session signing |
| `DEV_WEBHOOK_SECRET` | any random string | Used by the mock/dev integration adapter only |
| `AI_PROVIDER` | `mock` | Keep as `mock` for staging unless you specifically want to test a real OpenAI key |
| `NEXT_PUBLIC_SITE_URL` | the URL this staging environment will actually be reached at (e.g. `http://staging.example.com` or `http://localhost:3000` for a purely local run) | **Compiled into the build** — see section C, must be correct *before* `docker compose up --build`, not adjustable afterward without rebuilding |
| `NEXT_PUBLIC_REALTIME_URL` | matching realtime URL (e.g. `ws://localhost:3001`) | Same build-time caveat as above |

**Do not fill in**: `OPENAI_API_KEY` (leave empty unless deliberately testing the real provider), `CALENDLY_SCHEDULING_URL` (leave empty to exercise the "not configured" path honestly), `SENTRY_DSN` (leave empty unless you have a real staging Sentry project).

**`DATABASE_URL`/`REDIS_URL` in `.env` are for local, non-Docker development only** — `docker-compose.yml`'s `web`/`worker`/`realtime` services override both to point at the `postgres`/`redis` service names instead of `localhost` (this was a real, confirmed defect: `localhost` inside a container means the container itself, not its siblings — see the Repository Deployment Audit results at the end of this document). You do not need to edit `DATABASE_URL`/`REDIS_URL` for the Docker path to work; leave them as `.env.example` has them.

Full four-way environment variable classification is in the audit section at the end of this document.

## C. Build Command

```bash
docker compose build
```

or combined with startup (section D) as `docker compose up -d --build`.

**Before running this**, confirm `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_REALTIME_URL` in `.env` are already correct for this environment — they get compiled into the client JavaScript bundle and into every statically-prerendered public page (`/services`, `/about`, `/careers`, `/contact`, `/how-it-works`) at this exact step, via `docker-compose.yml`'s `web.build.args`. Changing `.env` after a build has already happened requires rebuilding (`docker compose build --no-cache web` at minimum for that service) — it is not picked up by restarting the container.

## D. Startup Command

```bash
docker compose up -d --build
```

Brings up, in dependency order: `postgres` → `redis` → (`web`, `worker`, `realtime` once postgres/redis report healthy).

Check status:

```bash
docker compose ps
```

Expect to see 5 services: `postgres`, `redis`, `web`, `worker`, `realtime`, all `Up` (and `postgres`/`redis`/`web`/`realtime` additionally showing `(healthy)` — `worker` has no configured healthcheck; see section F for why and how to verify it instead).

Check logs for startup errors:

```bash
docker compose logs web
docker compose logs worker
docker compose logs realtime
docker compose logs postgres
docker compose logs redis
```

## E. Migration Command

Migrations are **not** run automatically by any container on startup (deliberately — see the audit section: automatic migrations racing across multiple container replicas is a real risk this design avoids). Run once, manually, after the stack is up:

```bash
docker compose exec web npx prisma migrate deploy
```

This is the production-safe command (`prisma migrate deploy`, never `prisma migrate dev`) — it applies pending migrations in order and does not prompt, reset, or generate new migrations. All 7 existing migrations have been confirmed (this session, against a real disposable Postgres database, outside Docker) to replay cleanly from empty with zero schema drift against `prisma/schema.prisma`.

Then, for the smoke test in section G, seed the clearly-labeled demo/test data:

```bash
docker compose exec web npx tsx prisma/seed.ts
```

This creates `[DEMO]`-prefixed users (`admin@demo.gco`, `manager@demo.gco`, `operator1@demo.gco`, `client@demo.gco`, `hunter1@demo.gco`, all password `DemoPassword123!`) — never real accounts, safe for a disposable staging database only.

## F. Service Verification

| Service | Command | Port | Depends on | Env vars it needs | Health check | Expected startup behavior |
|---|---|---|---|---|---|---|
| **PostgreSQL** | `postgres:16-alpine` (official image, no custom command) | `5432` | — | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `pg_isready -U $POSTGRES_USER` | Ready within a few seconds; data persists in the `gco_postgres_data` named volume across restarts |
| **Redis** | `redis:7-alpine` (official image, no custom command) | `6379` | — | none (no password by default — see the comment in `docker-compose.yml` if this port will ever be reachable outside the compose network) | `redis-cli ping` | Ready almost immediately; data persists in `gco_redis_data` |
| **Web** | `node server.js` (the Next.js standalone build's own entrypoint) | `3000` | postgres (healthy), redis (healthy) | `DATABASE_URL` (overridden to the `postgres` service), `REDIS_URL` (overridden to the `redis` service), `AUTH_SECRET`, `DEV_WEBHOOK_SECRET`, `AI_PROVIDER`, `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_REALTIME_URL` (build-time only) | `GET /api/v1/health` via Node's own `http` module (no curl/wget in this alpine image) | Should be ready within ~15s of the container starting; `GET /api/v1/health` returns `{"healthy":true,...}` once Postgres/Redis are both reachable |
| **Worker** | `npx tsx workers/index.ts` | none (no listener) | postgres (healthy), redis (healthy) | same DB/Redis overrides as web | **none configured** — see below | Should log `"GCO workers started"` with `queueCount: 7` shortly after boot; consumes from all 7 BullMQ queues |
| **Realtime** | `npx tsx workers/realtime-server.ts` | `3001` (or `$REALTIME_PORT`) | postgres (healthy), redis (healthy) | same DB/Redis overrides, `REALTIME_PORT` | TCP connect check to its own port via Node's `net` module | Should log `"GCO realtime server listening"` with `port: 3001`; accepts WebSocket connections carrying a valid realtime ticket |

**Why `worker` has no Docker healthcheck**: it is a pure BullMQ consumer with no HTTP or TCP listener of its own to probe — a synthetic healthcheck would only be able to re-confirm "the process is alive," which Docker already tracks without one (`docker compose ps worker` shows `Up`/`Exited`/`Restarting`). Verify its *real* health two ways instead:
1. `docker compose logs worker` — confirm it started cleanly and is not crash-looping (`restart: unless-stopped` will keep restarting it silently if it's failing; a fast, repeating restart count in `docker compose ps` is the tell).
2. `GET /api/v1/admin/system-health` (authenticated) from the `web` service — shows live queue depths and dead-letter counts, which only move if the worker is actually consuming jobs.

## G. Smoke Test

One safe, end-to-end scenario using only test/staging data, exercising the public website, CRM, and BPO handoff in one pass:

```
PUBLIC WEBSITE (unauthenticated)
  → POST /api/v1/public/contact           creates a Lead (source: website_contact_form)
HUNTER (hunter1@demo.gco / DemoPassword123!)
  → GET  /api/v1/crm/leads?unassigned=true   sees the unassigned lead pool
  → POST /api/v1/crm/leads                   (or claims the contact-form lead) creates/claims a lead
  → POST /api/v1/crm/leads/:id/claim
  → POST /api/v1/crm/leads/:id/activities    logs an activity (extends the 30-day lock)
  → PATCH /api/v1/crm/leads/:id/stage        walks CONTACTED → ... → PROPOSAL
  → POST /api/v1/crm/leads/:id/submit-approval
CEO (admin@demo.gco / DemoPassword123!)
  → POST /api/v1/crm/approvals/:id/decide    {"decision":"APPROVED", "revenueBasisEurCents": 100000}
    → creates a Commission (server-calculated amount)
    → moves the lead to CLOSED_WON
    → enqueues the BPO handoff job
WORKER (background)
  → processes the BPO handoff job
    → creates a Tenant (the "client profile") - confirm via Prisma Studio or
      `docker compose exec web npx prisma studio` (bind it to a port, or
      query directly: `docker compose exec postgres psql -U gco -d gco -c
      "select id, name, slug from \"Tenant\" order by \"createdAt\" desc limit 5;"`)
```

`scripts/verify-docker-staging.sh` (in this repository) automates the contact-form → lead → claim → stage progression → approval portion end to end and reports PASS/FAIL for each step, plus every check from section F. It cannot, from a shell script alone, definitively confirm the BPO handoff's resulting Tenant was created (there is no generic "get handoff status by leadId" API) — do that one check manually with the `psql` query above, or via `docker compose exec web npx prisma studio` if you forward its port.

Run it:

```bash
chmod +x scripts/verify-docker-staging.sh
./scripts/verify-docker-staging.sh            # runs the full checklist, then tears the stack down
./scripts/verify-docker-staging.sh --no-down  # leaves the stack running afterward for manual poking
```

It fails loudly (non-zero exit, an explicit `[FAIL]` line per failed check, and a final summary) rather than silently passing — see its source for exactly what each check does.

## H. Failure Diagnosis

| Symptom | Likely cause | Where to look |
|---|---|---|
| `docker compose up --build` fails during the `web`/`worker`/`realtime` build | A genuine build defect (unlikely at this point — three were found and fixed by static review this session: missing `public/`, wrong worker command, missing realtime service) | The build output itself names the failing `COPY`/`RUN` step |
| `web`/`worker`/`realtime` start but immediately loop-restart | Cannot reach Postgres/Redis, or a missing required env var (`POSTGRES_PASSWORD` unset is the most likely - compose itself will refuse to start `postgres` at all in that case with a clear error) | `docker compose logs <service>` |
| `GET /api/v1/health` returns `"redis":{"status":"down"}` but Redis container shows healthy | `REDIS_URL` override not taking effect - confirm `docker compose exec web env | grep REDIS_URL` shows `redis://redis:6379`, not a `localhost` value | `docker compose exec web env` |
| `prisma migrate deploy` fails with a connection error | Postgres not actually healthy yet, or `DATABASE_URL` override not applied - confirm `docker compose exec web env | grep DATABASE_URL` | `docker compose exec web env`, `docker compose logs postgres` |
| Public pages load but canonical/OG tags still show `localhost` on a real staging domain | `NEXT_PUBLIC_SITE_URL` was not set correctly in `.env` **before** the build - it is compiled in at build time, not read at runtime; changing `.env` alone does not fix an already-built image | Rebuild: `docker compose build --no-cache web`, then `docker compose up -d web` |
| Realtime WebSocket doesn't connect from a real browser on the staging domain | `NEXT_PUBLIC_REALTIME_URL` wrong for the same build-time reason as above, or the realtime port isn't actually reachable through your reverse proxy/firewall from outside the Docker host | Browser DevTools Network tab (WS connection target + status); `docker compose logs realtime` |
| BPO handoff never completes (Tenant never appears) | Worker not actually running/consuming - check `docker compose ps worker` and `docker compose logs worker`; or check `GET /api/v1/admin/system-health`'s `deadLetter` queue count | `docker compose logs worker`, `admin/system-health` |
| Login fails with "Too many login attempts" | The Redis-backed login rate limiter (10 attempts / 15 min per IP+email) was tripped by repeated manual testing - this is correct behavior, not a bug; wait out the window or clear the specific key: `docker compose exec redis redis-cli KEYS 'gco:ratelimit:login:*'` then `DEL` it | Confirmed to happen during this project's own audit sessions - see `docs/GCO_PRODUCTION_GAP_REGISTER.md`/prior audit notes |

## I. Shutdown / Cleanup

```bash
docker compose down          # stops and removes containers, KEEPS data volumes
docker compose down -v       # also deletes the Postgres/Redis volumes - all data gone
```

Use `-v` for a disposable staging run; omit it if you want the database to persist across a `docker compose up` you'll run again later.

## J. Expected PASS/FAIL Output

Running `./scripts/verify-docker-staging.sh` against a correctly configured, healthy stack should end with something like:

```
=================== SUMMARY ===================
PASS | docker compose up --build |
PASS | postgres healthy | reported healthy after 6s
PASS | redis healthy | reported healthy after 3s
PASS | web healthy | reported healthy after 18s
PASS | realtime healthy | reported healthy after 12s
PASS | worker container running |
PASS | prisma migrate deploy |
PASS | seed demo data |
PASS | GET /api/v1/health |
PASS | Postgres reachable from web container |
PASS | Redis reachable from web container |
PASS | GET / (homepage) |
PASS | GET /services | 200
... (one line per public page)
PASS | NEXT_PUBLIC_SITE_URL baked into build | found ... in page output
PASS | login (admin@demo.gco) |
PASS | GET /api/v1/admin/system-health (authenticated) |
PASS | realtime server listening on :3001 |
PASS | POST /api/v1/public/contact |
PASS | POST /api/v1/public/careers/apply |
PASS | login (hunter1@demo.gco) |
PASS | CRM lead creation | leadId=...
PASS | lead claim |
PASS | stage progression to PROPOSAL |
PASS | submit for approval | approvalId=...
PASS | CEO approval (Closed Won) |
PASS | BPO handoff queue processing (worker still healthy after enqueue) | confirm the created Tenant manually per section G for full certainty
=================================================
PASS: 24  FAIL: 0

RESULT: PASS (all 24 checks passed)
```

Any `[FAIL]` line means genuine, unresolved verification failure — not a script bug to explain away. Fix the underlying cause (section H) and re-run from `docker compose up -d --build`.

---

## Repository Deployment Audit (performed this session, static review only)

This section records exactly what was checked and found before handing this off — so the Docker-capable operator isn't re-deriving from scratch.

### Findings this session

1. **Fixed — `DATABASE_URL`/`REDIS_URL` pointed at `localhost` inside containers.** Would have made `web`, `worker`, and `realtime` all fail to connect to anything the moment `docker compose up` actually ran (inside a container, `localhost` is the container itself, not the sibling `postgres`/`redis` containers). Fixed in `docker-compose.yml` by overriding both via `environment:` on all three services, derived from the same `POSTGRES_USER`/`PASSWORD`/`DB` already used to configure `postgres` itself, so the two can never drift apart.
2. **Added — health checks for `web` and `realtime`.** Previously only `postgres`/`redis` had any; `docker compose ps` alone couldn't reveal genuine application-level liveness for the other three services. `web`'s hits `GET /api/v1/health` via Node's own `http` module (no curl/wget in this alpine image); `realtime`'s does a TCP connect check to its own listening port. `worker` intentionally has none (see section F) — this isn't an oversight, it's documented.
3. **Already fixed in a prior session** (re-confirmed still correct this session): `public/.gitkeep` exists so the Dockerfile's `COPY --from=builder /app/public ./public` doesn't fail on a missing source; `worker`/`realtime` run via `npx tsx <entrypoint>.ts` rather than a `node ...js` command that would reference a file this build never produces; `NEXT_PUBLIC_SITE_URL`/`NEXT_PUBLIC_REALTIME_URL` are threaded through as Docker build `ARG`/`ENV` and `docker-compose.yml`'s `build.args`.
4. **No fix needed — migrations.** All 7 migrations confirmed (prior session, against a real disposable Postgres, outside Docker) to replay cleanly from empty via `prisma migrate deploy`, with zero drift against the current `schema.prisma`. The deployment command is already the production-safe one everywhere it's documented (`docs/deployment.md`) — never `prisma migrate dev`.
5. **No fix needed — migrations are not run automatically by any container.** Deliberate: automatic migration-on-boot across multiple container replicas is a real footgun this design avoids. The manual step (section E) is already documented in `docs/deployment.md`.

### Environment variable classification

**IMPLEMENTED** (referenced in code, documented in `.env.example`): `DATABASE_URL` (Prisma's own `env("DATABASE_URL")` binding), `REDIS_URL`, `AUTH_SECRET`, `AUTH_TOKEN_TTL_MINUTES`, `AUTH_REFRESH_TTL_DAYS`, `AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_REQUEST_TIMEOUT_MS`, `DEV_WEBHOOK_SECRET`, `CALENDLY_SCHEDULING_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_PORT`, `LOG_LEVEL`, `APP_NAME`, `NODE_ENV`, `FOUNDER_REVENUE_SHARE_PERCENT`, `DEFAULT_PRICE_PER_MESSAGE_EUR`, `DEFAULT_OPERATOR_COST_PER_MESSAGE_EUR`, `DEFAULT_OPERATOR_CAPACITY`, `DEFAULT_RESPONSE_SLA_SECONDS`, `FEATURE_AI_SUGGESTIONS`, `FEATURE_AI_MEMORY`, `FEATURE_AUTO_REASSIGNMENT`, `FEATURE_CLIENT_TICKETS`, `FEATURE_EMERGENCY_CONTROLS`, `FEATURE_ADVANCED_ANALYTICS`.

**IMPLEMENTED, infra-only (not read by application code, only by `docker-compose.yml`/Postgres itself)**: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — correct as-is; these configure the `postgres` container and are also used (this session) to derive the `web`/`worker`/`realtime` containers' `DATABASE_URL` override.

**MISSING**: none. Every environment variable referenced anywhere in `app/`, `lib/`, or `workers/` (including bracket-notation reads inside `lib/config/flags.ts`'s `boolEnv`/`intEnv` helpers, which a naive `process.env.X` grep would miss) is documented in `.env.example`. No additions were needed.

**OPTIONAL**: `SENTRY_DSN` (error tracking not wired up — see the prior production-readiness audit; leaving it empty is fine and does not degrade anything), `S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION` (documented as "only needed if media attachments are enabled" — they are not; see below).

**ORPHANED** (declared in `.env.example`, referenced nowhere in code): `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_ENABLED`, `APP_URL`, and the `S3_*` variables above (media attachments were never implemented, so these are speculative/leftover). Harmless but potentially confusing to a first-time deployer wondering whether they need to fill them in — they do not. Left in place rather than deleted, since removing them is cosmetic cleanup outside this task's scope, not a deployment defect.

### Service startup contract

See section F above — this *is* the service startup contract; it isn't duplicated here.

---

## Distinguishing what's actually been checked

- **STATICALLY VERIFIED** (this session, no Docker executed): every `Dockerfile`/`docker-compose.yml` `COPY`/build-context source exists; worker/realtime commands reference real entrypoint files; environment variable completeness (above); the `localhost`-vs-service-name defect and its fix; the new healthchecks' command syntax (`node -e ...`) checked for basic correctness by running the equivalent Node one-liners directly outside a container.
- **LOCALLY VERIFIED** (prior sessions, real Postgres/Redis, no Docker): the full application test suite (unit/integration/E2E, 132 tests total across this project's history) against a locally-running (non-containerized) stack; `prisma migrate deploy` against a real, disposable Postgres database, confirming clean replay from empty with zero drift; `npm run build` + `npm start`/`npm run dev` as direct approximations of what the Docker image runs.
- **DOCKER VERIFIED**: **nothing**. Docker has never been available in any environment this project has been developed in. `docker compose up -d --build` has never actually been executed.
- **EXTERNALLY VERIFIED**: nothing in this document — no real client integration, no real AI provider credential, no real Calendly account, no real webhook secret rotation, all remain exactly as prior audits found them.

**Move the current repository to a Docker-capable staging environment and execute this document (`docs/docker-staging-verification.md`) for real before claiming any part of the Docker path works.**
