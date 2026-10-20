# 03 — Staging setup

**Status summary:** the staging environment is **fully defined in version control and was built and run as a separate local stack, but it has not been deployed to any server and has not been run under Docker** (no Docker on the machine used). It is therefore **Implemented, locally verified; Docker/server deployment NOT TESTED / BLOCKED on approved infrastructure access.**

Staging already existed in the repository from earlier work (`docs/staging-environment.md`, `docker-compose.staging.yml`, `.env.staging.example`, `deploy/staging/*`, Caddy block). It was **reused, not rebuilt**; the only change in this work is that AI is now explicitly pinned off in it (`AI_MASTER_SWITCH: disabled`).

## 1. How the requirements are met

| Requirement | How | State |
|---|---|---|
| Isolated configuration | own compose project `gco-staging`, own network, volumes, ports (3200/3201 locally; loopback binds) | Defined; local equivalent verified |
| Separate database and Redis | own Postgres 16 and Redis 7 containers/volumes; locally a separate database `gco_staging` and Redis index 5 | Verified locally |
| Separate secrets | `.env.staging` (template `.env.staging.example`): new `POSTGRES_PASSWORD` and `AUTH_SECRET`, no production values, no OpenAI key | Defined; template checked by a test (`aiMasterSwitch`) |
| Separate backup paths | staging is not in the production backup timer; no offsite path configured | By omission (documented) |
| Synthetic data only | `prisma/staging-seed.ts`: three fictional clients, persona accounts, simulated client platform; refuses to run unless `GCO_ENVIRONMENT=staging` and an explicit confirmation variable | Verified (`stagingSeed` integration test) |
| No delivery to real clients/operators | clients use the `dev-mock` adapter only, enabled solely by `ALLOW_DEV_ADAPTERS=true` (production refuses it); the simulator and "replies received by the client platform" view exist only in staging | Verified (E2E `37`, `38`) |
| AI disabled | `AI_MASTER_SWITCH: disabled` in the compose environment (not overridable from `.env`) | Verified: staging stack health reports `ai: disabled` |
| Clear identification | yellow STAGING banner, `noindex` header and `Disallow: /` in robots, environment name in health | Verified (robots and health checked this session; banner by E2E `37`) |
| Access gate | Caddy basic-auth block (`staging.globalconversationoperations.com`), password hash installed by `deploy/staging/set-gate-password.sh`; block refuses to load until that file exists | Defined; **not deployed** |
| No debug/dev services exposed | web/realtime bind to `127.0.0.1`; Postgres/Redis publish no ports | Defined; **not verified under Docker** |
| Deployment and rollback | below | Documented |

## 2. Deployment procedure (needs approved server access — do not run until the CEO approves)

Prerequisite decisions: separate hostname DNS record (one A record `staging.<domain>`), capacity check (a second stack needs ≈1–1.5 GB RAM on the 8 GB host, or a small separate server).

```bash
cd /opt/gco
cp .env.staging.example .env.staging        # fill NEW secrets; never copy production values
sudo deploy/staging/set-gate-password.sh    # writes the Caddy gate hash (prompts, nothing in shell history)
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build
docker compose -f docker-compose.staging.yml exec -T web npx prisma migrate deploy
deploy/staging/seed.sh                      # fictional data; refuses outside staging
deploy/staging/create-owner.sh              # CEO login on staging (hidden prompt)
sudo caddy reload --config /etc/caddy/Caddyfile
curl -fsS https://staging.<domain>/api/v1/health   # expect environment "staging", ai disabled
```

**Rollback:** `docker compose -f docker-compose.staging.yml down` (keep volumes) to stop; `down -v` to discard the staging data; remove the Caddy block and the DNS record to withdraw it. Production is never touched by any of these commands.

## 3. Remaining manual actions (all need approval/access)

1. Approve the DNS record and the Caddy block (touches the production proxy file).
2. Choose where staging runs (same host if RAM allows, else a separate small server — a cost item, `05-infrastructure-budget.md`).
3. Provide the gate password (chosen by the owner, never committed).
4. Run the Docker verification in `docs/docker-staging-verification.md` once on a Docker host.
