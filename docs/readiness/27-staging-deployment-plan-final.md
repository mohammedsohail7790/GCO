# 27 — Staging deployment plan (final draft, for the CEO's step-by-step approval)

**Status:** nothing here has been run. The read-only server assessment results are **not in yet** (they need the CTO's SSH access: `scripts/server-readonly-assessment.sh`). This plan is final in structure; **step 0 decides whether it goes ahead at all.** Each step that changes the server, DNS or Caddy needs its own written approval. Fictional data only.

## 0. Gate: read-only assessment (approved)
Run from the CTO's machine; it reads only, writes nothing, prints no secrets:
`ssh <user>@<server> 'bash -s' < scripts/server-readonly-assessment.sh > assessment.txt` (then send `assessment.txt` to the CEO as it is).
**Go only if** MemAvailable ≥ 1536 MB and disk free ≥ 10 GB at a normal load, Docker and Compose are present, Postgres 5432 and Redis 6379 are not on a public address, and the nightly backup is recent. Otherwise stop and bring the options (smaller staging, on-demand staging, or a second server with a quote for approval).

## 1. Dependencies before any server change
| # | Dependency | Owner |
|---|---|---|
| a | The code changes (F1–F4, backup scripts, staging limits) are **committed and available to the server** (GitHub). Today they are uncommitted on the CTO's machine; committing and pushing needs an explicit instruction, and ideally the GitHub organization exists first | CEO decides, CTO acts |
| b | A recent, verified production backup exists (Hetzner backups option plus the nightly dump) | CTO |
| c | Docker present on the server. If absent, installing it is a server change that needs approval | CEO |
| d | The CEO has generated the backup keys (`docs/readiness/20` section 7) if encrypted backups are to be tested on staging | CEO |

## 2. Steps. Each row: what, risk, stop condition, rollback
| Step | Action (exact) | Changes production? | Main risk and stop condition | Rollback |
|---|---|---|---|---|
| **S1** Prepare files | On the server, `cd /opt/gco`, fetch the approved commit (`git fetch && git checkout <approved commit>` in a **separate directory** such as `/opt/gco-staging` so the production checkout is untouched). Copy `.env.staging.example` to `.env.staging`, fill **fresh** secrets: `AUTH_SECRET=$(openssl rand -hex 32)`, a new `POSTGRES_PASSWORD`, `HSTS_MAX_AGE_SECONDS=300`, `chmod 600 .env.staging` | No | A production secret copied by mistake: check `diff` shows no shared values | `rm -rf /opt/gco-staging` |
| **S2** Gate password | `deploy/staging/set-gate-password.sh` writes `/etc/caddy/staging-auth` (a hash). **Must exist before any Caddy change** | Adds one file; Caddy not touched | None for production | delete the file |
| **S3** Build and start staging | `cd /opt/gco-staging && docker compose -f docker-compose.staging.yml --env-file .env.staging up -d --build` (project `gco-staging`, ports `127.0.0.1:3200/3201`, memory/CPU limits from the file). Do it **outside business hours**, with `docker stats` and the production health URL open | **Risk to production**: building the images (npm install, Next.js build) can use 1.5–2 GB of memory temporarily on the shared host, and limits on running containers do not limit a build | **Stop if** MemAvailable drops below 600 MB or the production health check slows or fails: `docker compose … stop` and do not retry on this host. Safer option: build the images on another machine or in CI and load them, or use a one-off larger build window | `docker compose -f docker-compose.staging.yml down` (keep volumes), or `down -v` to discard |
| **S4** Migrate and seed | `docker compose -f docker-compose.staging.yml exec web npx prisma migrate deploy`; seed with a typed staging password as in `docs/staging-environment.md` (the seed refuses unless `GCO_ENVIRONMENT=staging`); create the CEO staging account with `prisma/ops/staff-account.ts` | No (staging database only) | Wrong target database: staging uses its own Postgres container | `down -v` |
| **S5** Verify privately (no DNS, no Caddy) | From the CTO's machine: `ssh -L 3200:127.0.0.1:3200 -L 3201:127.0.0.1:3201 <server>`, then run the suite against `http://localhost:3200` with `E2E_BASE_URL` and `E2E_STAGING=1`; check headers (`curl -I`), the realtime connection, and the browser console for CSP report-only messages while signed in | No | A failing test is a finding, not a reason to touch production | `down` |
| **S6** Encrypted backup test | With the CEO's two public keys: create `/etc/gco-backup-age-recipients.txt` **in the staging container/test location only**, run the encrypt and decrypt test from `20` section 6 against staging data, with the CEO decrypting using his private key on his machine | Staging only (age installed in the staging context; installing `age` on the production host is a separate approval) | Key mistakes: verify the decrypt before anything else | remove the recipients file |
| **S7** Two-factor tests | Execute `26` section 4 on staging | No | None | revert the setting |
| **S8** Public access to staging (**separate approval; a production change**) | (1) Save the current Caddyfile (`cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-staging`). (2) Add the staging block already in the repository. (3) `caddy validate --config /etc/caddy/Caddyfile`. (4) **`systemctl reload caddy`**, not restart. (5) Immediately check the two production sites return 200. (6) Add the Cloudflare record `staging` (proxied A to the server) | **Yes**: Caddy and DNS | A bad Caddyfile can take down **production** sites. `validate` first; reload keeps the old config on failure. **Stop if** any production check is not 200 | `cp -a /etc/caddy/Caddyfile.pre-staging /etc/caddy/Caddyfile && systemctl reload caddy`; delete the DNS record |
| **S9** ZAP baseline (approved on staging only) | From the CTO's machine, against the staging URL only, with the gate password. No production URL, no other host | No | Scan load on a shared host: run off hours, cap the scan time | stop the scan; `down` |

## 3. What is checked at every step
Production health URL and both site URLs return 200; `docker stats` memory; response time of the production site (before and after). Record before/after numbers in the report.

## 4. Costs
€0 if the assessment passes. A second server, extra build capacity or paid CI would each be quoted and approved separately.

## 5. Estimated timing
S1–S7 about a day of work once the assessment is positive and the code is on the server; S8 about an hour in a window; S9 a few hours. Target remains staging by end of October if the approvals arrive; ZAP early November.

## 6. Approval record (CEO)
| Step | Approved on | Notes |
|---|---|---|
| 0 assessment | approved 2026-10-23 | |
| S1–S7 | | |
| S8 Caddy + DNS | | separate approval |
| S9 ZAP | approved in principle (staging only) | |
