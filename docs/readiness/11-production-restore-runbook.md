# 11 — Production backup restore test: runbook (CTO + CEO)

**Goal:** prove that a real production backup can be restored in an isolated environment, and measure it. **Production is never touched.** This needs the CEO's approval and a Docker-capable (or local PostgreSQL) machine you control. Nothing here has been executed against production yet — **NOT TESTED**.

## Safety rules
- Restore only into a **throwaway** PostgreSQL (new container or local install) — never to the production server, never with `--clean` against an existing database.
- The dump holds **real data and plaintext integration secrets**: use a private machine, `chmod 600`, delete it (and the throwaway database) when finished, never email or upload it.
- Do not paste any credential into chat, tickets or this repository.

## Steps
1. **Pick the dump.** On the server: `ls -lh /var/backups/gco-postgres/` (newest `gco-postgres-<UTC timestamp>.dump`), or download the newest object from the Backblaze B2 bucket (console download, or a temporary **read-scoped** key created by the account owner and deleted afterwards — the nightly upload key cannot read).
2. **Verify integrity of the copy.** Compare size and SHA-1 with the nightly upload record (`journalctl -u gco-backup-postgres.service | grep "b2: verified"`). Transfer with `scp` (SSH key) to your machine.
3. **Start a throwaway PostgreSQL 16:**
   `docker run --rm -d --name gco-restore-pg -e POSTGRES_HOST_AUTH_METHOD=trust -p 55440:5432 postgres:16-alpine`
   (no Docker: use a local PostgreSQL 16 install and its admin URL.)
4. **Run the restore test** from the repository root:
   ```bash
   DUMP_FILE=/path/to/gco-postgres-<timestamp>.dump \
   TARGET_ADMIN_URL=postgresql://postgres@127.0.0.1:55440 \
   scripts/restore-production-dump.sh
   ```
   It validates the archive, restores into a new randomly-named scratch database, prints table/migration counts and row counts of key tables, runs the 14 integrity and tenant-boundary checks (`scripts/restore-verify.sql`), computes the dump's age and the restore time, and writes `restore-report-<UTC>.md` (counts only, no data). It exits non-zero on any violation. A dump older than the repository's newest migration is reported as "behind" (expected for an old dump).
5. **Application check (optional but recommended):** point a **staging** copy of the application (synthetic-only secrets, AI off, no real integrations) at the restored database, run `prisma migrate deploy`, and perform read-only smoke checks: `GET /api/v1/health`, sign in as a test CEO, open the dashboard, open one client's conversations. Do not enable workers on restored data (they could send real callbacks to real client URLs).
6. **Clean up:** `docker rm -f gco-restore-pg` (or drop the scratch database), delete the dump and any extracted files.
7. **Record the result** in `04-backup-restore-test-report.md` as a new run: date, dump timestamp and **age (= achieved RPO)**, restore duration (database step), counts, violations, anything manual. Agree RPO/RTO targets with the CEO only after this measurement.

## What the test proves and does not prove
Proves: the dump is complete and restorable, migrations match, the data is internally consistent and tenant boundaries are intact. Does **not** prove: a full server rebuild from nothing (Docker, Caddy, DNS, secrets), recovery time of the whole service, or the offsite object's availability beyond the one object tested. A full rebuild drill on a spare server is a separate exercise (`docs/disaster-recovery.md` §10–12).

## Approvals and access needed
CEO approval to handle a production dump; CEO or the B2 account owner for the download key; SSH access to the server; a Docker host or local PostgreSQL 16.
