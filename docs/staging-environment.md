# GCO staging environment (for the owner to test safely)

Status: **built and verified locally; NOT deployed anywhere.** Nothing on the production server has been changed for it.

## What it is
A second, completely separate copy of the platform: its own Postgres, Redis, secrets and containers, holding **only fictional data**.
The owner (Cristian) gets a CEO login there and can test every role without touching production. Differences from production are explicit:
- `GCO_ENVIRONMENT=staging` (server) and `NEXT_PUBLIC_GCO_ENVIRONMENT=staging` (build): a yellow **STAGING** banner on every page, `noindex` and `Disallow: /` in robots.
- `ALLOW_DEV_ADAPTERS=true`: the simulated client platform (`dev-mock`) can be active. Production refuses this.
- `AI_PROVIDER=mock`, no OpenAI key. (So AI suggestions are placeholders. Testing real AI quality needs a separate decision and key.)
- Staging-only tools (owner only, `404` anywhere else, even for the owner in production): **Admin → Staging tools** (`/admin/staging`) with the
  client simulator and the "replies received by the client platform" view.

## The three fictional clients (`lib/staging/clients.ts`)
| Client | Service | Team languages | SLA | Capacity | Hours |
|---|---|---|---|---|---|
| Aurora Retail | customer support for a shop | it, en / de, en / es, fr | 120 s | 3 | Mon-Fri 08-20 (Rome) |
| Pixel Arena | chat moderation for a game | sv, en / de, en / en | 60 s | 4 | 24/7 |
| Harbor Community | community moderation, dedicated team | it, fr / fr, en / sv, en | 300 s | 2 | daily 10-22 (Paris) |
Each has a supervisor, a client contact, three operators (one online, two offline so availability can be tested), one simulated client
platform with its **own** secret, and two history conversations. All six GCO languages are staffed somewhere.
Persona emails: `manager.<key>@staging.gco`, `client.<key>@staging.gco`, `operator1..3.<key>@staging.gco` (keys: `aurora`, `pixelarena`, `harbor`).

**Honest scope:** the clients differ in team, languages, SLA, capacity and hours. The operator workspace does **not** yet change per service type
(no knowledge base, customer records or moderation tools), and there are no per-client AI instructions, shifts or operator-to-operator transfers.
That is exactly what the owner's testing should confirm or prioritise.

## Accounts and passwords (nobody's password is in the repository)
- The shared password for the fictional personas is chosen by whoever runs the seed (`STAGING_PERSONA_PASSWORD`, 12+ chars, must pass the staff
  policy; the published demo password is refused). It is not stored in the repo or printed.
- The owner's CEO account on staging is created with the existing tool and a hidden prompt (use a staging-only password, not the production one):
  `docker compose -f docker-compose.staging.yml exec worker npx tsx prisma/ops/staff-account.ts --role CEO_ADMIN`
- Two-factor sign-in works on staging too (separate `AUTH_SECRET`, so seeds are not interchangeable with production).

## Commands
```
# seed / reset (run on the staging host; the password is typed, not put in shell history)
read -rs STAGING_PERSONA_PASSWORD; export STAGING_PERSONA_PASSWORD
docker compose -f docker-compose.staging.yml exec -e STAGING_PERSONA_PASSWORD -e GCO_ALLOW_DEMO_SEED=yes-this-is-staging-not-production worker npx tsx prisma/staging-seed.ts
...same with  --reset  to clear conversations/reviews/escalations and start a round clean (accounts and settings are kept)
```
The seed refuses unless `GCO_ENVIRONMENT=staging`.

## How it was verified (locally; Docker is not available on the development machine)
A second stack of the same code ran locally against a separate database (`gco_staging`), Redis index 5 and ports 3200/3201 (`~/gco-local/staging.sh`).
- `tests/e2e/37-staging.spec.ts` (run with `E2E_STAGING=1`): health reports staging; the simulator is owner-only (manager/operator get 403, anonymous 401);
  three clients ready; English message to Aurora is assigned, Swedish waits (no covering operator), Pixel Arena message assigned; an operator reply shows up in
  the client platform view; replies never leak to another client; another client's supervisor cannot find Aurora's conversations.
- `tests/e2e/38-staging-absent.spec.ts` (normal suite): outside staging the tools return 404 even for the owner, health says `production`, robots allow crawling, no banner.
- `tests/unit/stagingEnvironment.test.ts`, `tests/integration/stagingSeed.test.ts`: flags, seed guards, password policy, idempotent seed, separate teams/secrets, reset.
- `docker-compose.staging.yml` and `.env.staging.example` were written but **not run** (no Docker locally). First run on a Docker host must be watched.

## Rolling it out (needs the owner's approval: it touches the production server's proxy/DNS)
Keep it away from production data and access:
1. DNS: one new record, e.g. `staging.<domain>`, via the DNS provider. (Production unchanged.)
2. Caddy: one new site block proxying to `127.0.0.1:3200` (web) and the realtime path to `127.0.0.1:3201`, with an **extra access gate** in front (Caddy basic auth or
   Cloudflare Access limited to the owner and engineering) and a `X-Robots-Tag: noindex` header. Staging must not be openly reachable: it has simulator tools and a shared persona password.
3. Capacity: the server has 8 GB; a second stack (Postgres, Redis, web, worker, realtime) needs roughly another 1-1.5 GB. Check headroom first; otherwise use a small separate server.
4. Separate secrets: new `POSTGRES_PASSWORD` and `AUTH_SECRET`; no OpenAI key; no production values anywhere in `.env.staging`.
5. `docker compose -f docker-compose.staging.yml up -d --build`, migrate (`prisma migrate deploy` in the web container), seed, create the owner's CEO account, then run the smoke checks above against the staging URL.
6. Production firewall/SSH/backups/Postgres/Redis/realtime configuration are not modified by any of this.
