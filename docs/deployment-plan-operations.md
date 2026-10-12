# Production deployment plan - operations features (NOT YET APPROVED, NOT EXECUTED)

Do not run until the owner approves in writing. Same procedure as `docs/deployment-plan-language-qa.md`.

## What changes
- One additive migration: `Tenant.timezone` (TEXT NOT NULL DEFAULT 'UTC') and `Tenant.operatingHours` (JSONB NULL). Existing tenants keep
  behaviour (UTC, 24/7).
- New routes: conversations resolve/reopen/notes/search/transcript, `/ops/alerts`, `/reports/client`, `/tenant/settings`,
  `/auth/change-password`; new UI panels on the manager, operator, client, admin and hunter pages and a new `/account` page.
- New permissions in `lib/auth/rbac.ts`. No change to Postgres/Redis/Caddy/UFW/SSH/Cloudflare/backups/realtime configuration.

## Steps
1. Local gate green on the exact commit (lint, tsc, unit, integration, build, e2e) - see the deployment record below.
2. Verified backup: `ssh gco@<server> 'sudo systemctl start gco-backup-postgres.service && journalctl -u gco-backup-postgres.service -n 6 --no-pager'` - proceed only if "offsite upload to B2 verified".
3. Tag rollback images (`gco-web:pre-ops`, `gco-worker:pre-ops`), rsync with `--exclude deliverables --exclude .env*`, `docker compose build web worker`.
4. `docker compose run --rm --no-deps -T web npx prisma migrate deploy` (expect exactly one migration).
5. `docker compose up -d --no-deps web worker`; confirm healthy and postgres/redis/realtime uptime unchanged.

## Post-deploy checks (read-only; create no data)
- `/`, `/login`, `/careers` -> 200; anonymous GET/POST on the new endpoints -> 401.
- `select column_name from information_schema.columns where table_name='Tenant' and column_name in ('timezone','operatingHours')` -> 2 rows; every tenant has timezone 'UTC'.
- Logged in as CEO (after the owner confirms): manager dashboard shows the alerts banner ("All clear" with no operators is expected to show "No operator" alerts only if conversations are queued); `/account` loads.

## Rollback
Retag `gco-web:pre-ops` and `gco-worker:pre-ops` as `latest`, `docker compose up -d --no-deps web worker`. The old code ignores the two new columns; no migration rollback is needed.

## Deployment record (executed 2026-10-12, owner-approved)
- Local gate on the deployed code: lint, tsc clean; unit 422/422; integration 140/140; build clean; e2e 250/250.
- Backup: `gco-postgres-20261012T062516Z.dump` (898,008 bytes), B2 upload verified (sha1 1bcd2f66...).
- Server HEAD after rsync: `bebfdda`; `deliverables/` was not sent. Rollback tags: `gco-web:pre-ops`, `gco-worker:pre-ops`.
- Migration `20261012061427_tenant_operating_hours` applied (14 total). Only web and worker were recreated; postgres/redis/realtime were not restarted.
- Post-deploy (read-only): web healthy, worker up, 0 errors in logs; the one tenant has timezone UTC and no operating hours (24/7, unchanged behaviour); no operator over capacity; `/`, `/careers`, `/login`, `/pilot`, `/account` return 200; every new endpoint returns 401 to an anonymous caller; `/manager` redirects when signed out. Only the real CEO and Hunter accounts are active. No production data was created.
