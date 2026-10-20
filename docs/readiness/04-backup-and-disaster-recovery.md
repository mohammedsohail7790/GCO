# 04 — Backup and disaster recovery

**Status:** the backup mechanism is documented as active in production (activated and first-verified 2026-10-04 per `docs/disaster-recovery.md` §9). **This session had no production access, so none of the production facts below were re-verified** — they are labelled *documented*. What was executed here is a restore drill against a **local development database** (`04-backup-restore-test-report.md`). A successful upload is not treated as proof of recoverability.

## 1. What is backed up

| Item | Mechanism | State |
|---|---|---|
| PostgreSQL (all application data: tenants, users, conversations, messages, ledgers, invoices, audit log, CRM) | nightly `pg_dump -Fc` at 03:30 UTC via systemd timer (`scripts/backup-postgres.sh`, `deploy/systemd/gco-backup-postgres.*`), run inside the postgres container | documented active; **not re-verified** |
| Integrity check | `pg_restore --list` against the dump in a throwaway container before it is accepted | documented; script reviewed |
| Offsite copy | upload to a Backblaze B2 private bucket (`scripts/b2-upload.py`, stdlib only), verified from B2's upload response (name, size, SHA-1) | documented active since 2026-10-04 |
| Redis | **not backed up, by design**: it holds queue state only; after loss, queues start empty and the 15-second sweep plus client retries repopulate work from `WebhookEvent` rows | documented; local reasoning verified (sweep code) |
| Uploaded files / attachments | **none exist**: messages are plain text (`Message.content`), moderation media are client-hosted https links never fetched (code search found no upload handling) | verified by code search |
| Application code, compose files, Caddyfile | in Git (single owner today, see `07`) | verified present |
| Secrets (`.env`, `AUTH_SECRET`, B2 credentials) | **not in Git and not in backups**; recovery procedure in `docs/disaster-recovery.md` §14 | documented; owner must hold them |
| Cloudflare/DNS records | documented in `docs/disaster-recovery.md` §5 (record names, no secrets) | documented |

## 2. Configuration facts (documented, verify on the server)

- **Frequency:** daily, `Persistent=true` (a missed run executes at next boot), randomised delay.
- **Local retention:** 14 days (`RETENTION_DAYS` in the script; deletes only `gco-postgres-*.dump` in the backup directory).
- **Offsite retention:** **none configured** — bucket keeps all versions. A 30-day lifecycle rule was proposed but not applied.
- **Storage/access:** local dumps `chmod 600` in a `700` directory owned by `gco`; offsite bucket private, server-side encryption on, EU region.
- **Credential separation:** B2 credentials live only in `/etc/gco-backup-b2.env` (root, 0600), read via systemd `EnvironmentFile`; never arguments, never logged. Backup script uses the container's local socket and reads no database password.
- **Encryption:** in transit TLS to B2; at rest B2 server-side encryption; **no client-side encryption** (deferred until a key-recovery vault exists).
- **Failure alerting:** the service exits 1 (local failure) or 2 (local OK, offsite failed) so systemd shows `failed`; the new in-app alert routing and optional email can notify roles, but **no alert is wired to the backup job's exit status** — a failed backup is visible only in `systemctl`/`journalctl` unless someone checks. **Gap G-1.**

## 3. Findings

| ID | Finding | Severity | Recommendation (not applied — live storage / server changes need approval) |
|---|---|---|---|
| B-1 | The offsite key's "write-only" console preset still grants `deleteFiles` and bucket-setting capabilities (documented finding 2026-10-04) | High | Create a key with `writeFiles` only (B2 CLI/API); rotate; account owner action |
| B-2 | No remote retention/lifecycle; versions accumulate forever (also a **data-retention exception**, see `06`) | Medium | 30-day lifecycle rule once the retention policy is approved |
| B-3 | Dumps contain plaintext integration webhook secrets | Medium | encrypt secrets at rest (code change) or client-side encrypt dumps with a recoverable key |
| B-4 | No alert on backup failure | Medium | add a monitor on the unit's exit status / a "last successful backup age" check |
| B-5 | Production restore never drilled | High | run the drill with a real dump (§5) |
| B-6 | Single server, single Postgres instance, no point-in-time recovery: the **recovery point is up to ~24 hours** by design (nightly dump) | Medium | decide acceptable RPO with the CEO; WAL archiving/managed Postgres would cost more |

## 4. Recovery dependencies

To rebuild from nothing you need: Git repository access, the server (or a new Hetzner server), the `.env` secrets (`AUTH_SECRET`, `POSTGRES_PASSWORD`, integration secrets live in the database dump), Cloudflare access (two A records only), a dump (local or B2), and a Docker host. Steps: `docs/disaster-recovery.md` §10–12 and `docs/recovery-runbook.md`.

## 5. Repeatable restore procedure and script

`scripts/restore-drill.sh` (this work): dumps a database, validates the archive, restores it into a scratch database, then compares every table's row count, checks the migration count, runs 14 read-only integrity and **tenant-boundary** queries (`scripts/restore-verify.sql`: orphaned rows, rows whose tenant differs from their parent, duplicate active assignments, duplicate external ids, ledger/message mismatches, issued invoices without numbers …) and asks Prisma whether the restored schema is up to date. Exit status is non-zero on any difference.

```bash
SOURCE_URL=postgresql://user@host:5432/db  PG_BIN=/path/to/postgres/bin  scripts/restore-drill.sh
```

**To drill a real production backup (needs the owner's approval and a downloaded dump):** download the latest B2 object (console or a temporary read key; compare size and SHA-1 with the upload log), start an isolated `postgres:16-alpine` container, `pg_restore --no-owner` into it, then run the script's checks by pointing `SOURCE_URL` at that container (or run `scripts/restore-verify.sql` directly). Record the dump's age (the achieved RPO) and the wall-clock time (a measured RTO for the database step).

## 6. RPO and RTO

**No RPO or RTO is claimed.** The design implies an RPO of up to one day (nightly dump). The only restore timing measured is a local 848 KB development database (≈1 second), which says nothing about production size or a full server rebuild. Agree targets with the CEO, then measure.

## 7. Unresolved recovery risks

B-1 … B-6 above; plus: Redis password/persistence not enabled (queue state is reconstructable, not recoverable); one operator (the server's `gco` user) can both run and delete local backups; the B2 account and Hetzner account each have a single owner (`07`/`08`).
