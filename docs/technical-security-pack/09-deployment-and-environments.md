# 09 — Deployment and environment model

**Internal document** (contains the operating procedure). A sanitised summary is in `client-facing-overview.md`. Nothing here was executed against production in this audit.

## 1. Environments
| Environment | Where | Data | AI | Client integrations | Status |
|---|---|---|---|---|---|
| Development | developer machine; `npm run dev`, local PostgreSQL/Redis | synthetic | off by default (test configuration opts into the mock) | `dev-mock` | Verified (this audit ran on one) |
| Staging | defined by `docker-compose.staging.yml`; **runs only as a local second stack today**; server deployment pending approval | fictional only (seed refuses elsewhere) | **off** | simulator only | Implemented; **not deployed** |
| Production | single Hetzner Cloud server (Nuremberg), Docker Compose (web, worker, realtime, postgres, redis), Caddy on the host, Cloudflare in front | real data (none from real clients yet) | **off** (pinned in compose) | `dev-mock` refused; none active with a real client | Documented; **not inspected** |

## 2. Production deployment process (documented)
1. Code is synchronised to `/opt/gco` (rsync/git; the server also keeps full history).
2. `docker compose build web worker realtime` (the image builds the Next.js app; `NEXT_PUBLIC_*` values are build arguments).
3. **Database migration:** `docker compose exec -T web npx prisma migrate deploy` (forward-only; Prisma has no automatic down-migration — rollback of a schema change is a deliberate manual decision, `../recovery-runbook.md` §12).
4. `docker compose up -d web worker realtime`; containers use `restart: unless-stopped`; web/realtime/postgres/redis have healthchecks; web and realtime bind to `127.0.0.1` only; databases publish no ports.
5. Smoke check: `GET /api/v1/health` returns healthy with `ai: disabled`; sign in; open a dashboard.
6. Caddy terminates TLS (Let's Encrypt), Cloudflare in front; the proxy source file is version-controlled and symlinked into `/etc/caddy`.

**Before every deployment:** run typecheck, lint, unit, integration and E2E on a clean checkout; take a database dump; confirm the diff does not touch AI settings.

## 3. Rollback
- **Application:** re-sync the previous commit and `docker compose up -d --force-recreate web worker realtime`. Documented, **not tested as a complete drill**.
- **Schema:** forward-only; a reverse migration must be hand-written and tested on a restored copy first. Restore from backup only as a last resort (`04`).
- **Staging:** `docker compose -f docker-compose.staging.yml down` (add `-v` to discard data).

## 4. Secret handling
Server environment files (`/opt/gco/.env`, optional AI file) with mode 0600; a separate root-only file for backup credentials; staging uses entirely separate values; nothing secret is in Git or the images' build context beyond examples; integration webhook secrets live in the database (a risk noted in `04` B-3). Rotation owner and schedule are **not yet defined** (`../readiness/08`).

## 5. Migrations and compatibility
29 migrations, all additive in this engagement; each was applied to a clean database and to an upgraded one in tests; a restored copy reports "up to date" (`04-backup-restore-test-report.md`).

## 6. Sanitised summary for external readers
GCO runs as a containerised web application with a PostgreSQL database and a job-queue service on a managed cloud server in the EU, behind a TLS reverse proxy and a DNS/edge provider. Production, staging and development are separate configurations with separate secrets; staging holds fictional data only. Changes are tested automatically before release and are applied with a documented procedure that includes a database backup.
