# 33 — Release window runbook (Saturday 31 Oct 2026, 07:00–09:00 Italy; fallback Sunday 1 Nov)

**Do not run any step until the CEO has approved in writing and the CTO confirms.** This sheet turns plan `28` §5–§8 into exact commands and records the dry-run done on 30 Oct. Server: `gco@188.245.22.254` via the single authorised key, folder `/opt/gco`. Each step stops the procedure on failure. Times are Italian time; the window is 11:30–13:30 IST.

## Prepared on 30 Oct (read-only checks, nothing changed on the server)
- **File sync dry run** (`rsync -rcn`, release export of HEAD against `/opt/gco`, excluding `node_modules`, `.next`, `.git`, `.env*`, `Caddyfile`, `.tools`): **500 entries** (222 `app`, 74 `docs`, 65 `lib`, 53 `tests`, 33 `prisma`, 19 `components`, 11 `deploy`, 9 `scripts`, 1 `workers`, plus config files). **`Caddyfile` and `.env*` do not appear.** No `--delete`, so server-only files stay.
- **`docker-compose.yml` differs from the server's by exactly three added lines** (`AI_MASTER_SWITCH: disabled` for web, worker, realtime). Nothing else in compose changes.
- **Backup script change is safe:** the release adds optional age encryption that switches on only if `/etc/gco-backup-age-recipients.txt` exists. That file does **not** exist today, so nightly backups behave exactly as before (plain dump, offsite upload unchanged). Encryption starts only after the CEO provides his public keys.
- **New systemd timer files** (alerts, retention, weekly reports) arrive as files only; they are **not** enabled by the release. Enabling them is a separate approved step.
- Rollback tags exist: `gco-web|worker|realtime:pre-release-20261029`. A code snapshot is in `/var/backups/gco-postgres/gco-code-pre-release-*.tgz`.

## Steps

**0. Before touching anything (07:00).** CEO's written approval in hand. `cd /opt/gco && docker compose ps` (all up, web healthy); `df -h /` (≥ 20 GB free); `curl -s https://app.globalconversationoperations.com/api/v1/health`.

**1. Fresh backup.** `/opt/gco/scripts/backup-postgres.sh` (a manual run prints an offsite "failed" message because it lacks the root-only credential file; the local dump is what matters here). Check the new file in `/var/backups/gco-postgres/`, size ≈ 0.9 MB; `pg_restore --list` readable; restore into a throwaway Postgres container (start it, **wait until a real `psql` query works**, then restore): expect 16 migrations, 7 users, 1 tenant, 1 message, 0 warnings; remove the container.

**2. Refresh the rollback tags and code snapshot.** Images: `for s in web worker realtime; do docker tag "$(docker compose images -q $s | head -1)" "gco-$s:pre-release-20261031"; done`. Code: `tar czf /var/backups/gco-postgres/gco-code-pre-release-$(date -u +%Y%m%dT%H%M%SZ).tgz --exclude=node_modules --exclude=.next --exclude='.env*' -C /opt gco` then `chmod 600` (the folder `/var/backups` itself is not writable by `gco`; do not use sudo).

**3. Sync the release.** From a clean export of the approved commit on the CTO's computer: `rsync -rc --exclude node_modules --exclude .next --exclude .git --exclude '.env' --exclude '.env.*' --exclude Caddyfile --exclude .tools ./ gco@188.245.22.254:/opt/gco/`. Run the same command with `-n --itemize-changes` first and compare with the 30 Oct numbers above; stop on any surprise (especially `Caddyfile` or `.env`).

**4. Build.** `docker compose build web worker realtime`. Stop on error (old containers are still running).

**5. Apply.**
1. `docker compose up -d --no-deps --force-recreate web`
2. `docker compose exec -T web npx prisma migrate deploy` → expect 29 migrations, 0 failed.
3. `docker compose up -d --no-deps --force-recreate worker realtime`

**6. Verify (all must pass).**
- `docker compose ps`: five services up, web healthy.
- Health URL returns ok and **`ai` disabled**.
- `for s in web worker realtime; do docker compose exec -T $s printenv AI_MASTER_SWITCH; done` → `disabled` ×3.
- Migrations: 29 finished, none failed (`select count(*) from _prisma_migrations where finished_at is not null`).
- Sign-in: the CEO signs in as Founder; one operator and one client sign-in; the operator panel on the demo conversation shows **no AI draft**; a simulated demo-tenant message is assigned and an operator reply is delivered; tenant separation (client sees only its own).
- Response header `Content-Security-Policy-Report-Only` present on the login page.
- `docker compose logs --since 10m worker web | grep -iE "error|fatal"` shows nothing alarming for 10 minutes; no OpenAI calls.
- Nightly backup timer still active (`systemctl list-timers | grep gco`).

**7. Report** to the CEO with the results, then the 24-hour watch: next nightly backup succeeds (03:30 UTC), OpenAI usage zero after release time.

## Rollback (any failed check, or a critical service unhealthy > 10 minutes)
- **Code:** `docker tag gco-web:pre-release-20261031 gco-web:latest` (same for worker, realtime; use the 20261029 tags if the new ones were not created), then `docker compose up -d --no-deps --force-recreate web worker realtime`. Additive migrations let the old code run on the new schema (proven in two rehearsals), so the database stays.
- **Database, only if data is damaged:** stop web/worker/realtime; in the Postgres container `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then **plain** `pg_restore` of the step-1 dump (**never** `--clean --if-exists`); confirm 16 migrations and counts; start the old images.
- Tell the CEO immediately, with the reason and the state.

## Known limits of this sheet
Compose recreate and the image re-tag on the live stack have never been rehearsed (they cannot be isolated); the offsite (Backblaze) restore is not yet proven; the smoke test uses the demo accounts once (their published password is a known risk; they are switched off after the CEO's separate approval).
