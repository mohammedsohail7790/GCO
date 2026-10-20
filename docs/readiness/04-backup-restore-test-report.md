# 04 — Backup restoration test report

**What this test is — and is not.** An isolated restore of a dump of the **local development database** (synthetic test data created by the automated test suites, 61 tables, no real customer data). It exercises the restore procedure, the integrity checks and the application's migration tool. It is **not** a restore of a production dump or a Backblaze B2 object, and it says nothing about production data volume or recovery time. **Production restore: NOT TESTED.**

## Run 1 — current checkout

| Item | Value |
|---|---|
| Date/time | 2026-10-20 05:11 UTC (restore completed within the same second; scratch database `gco_restore_drill_1792473074`) |
| Command | `SOURCE_URL=postgresql://gco_local@127.0.0.1:55432/gco PG_BIN=<Postgres 16 bin> scripts/restore-drill.sh` |
| Source | local PostgreSQL 16, database `gco` (never modified; dump taken read-only) |
| Backup selected | a fresh `pg_dump -Fc` of the source, 848 KB |
| Integrity of the archive | `pg_restore --list` succeeded |
| Restore target | new scratch database in the same local cluster; dropped by the script's exit trap (verified: 0 `gco_restore_drill*` databases remained) |
| Start / completion | dump + restore + checks measured by the script: **1 second** (not representative of production) |
| Tables / rows | 61 tables; **row count of every table identical** between source and restored copy |
| Migrations | 29 applied in both; `prisma migrate status` against the restored copy: **up to date** |
| Integrity and tenant-boundary checks (`scripts/restore-verify.sql`) | 14 checks, **0 violations**: no message without a conversation; no message/assignment/usage row whose tenant differs from its parent; no usage or earning line without its message; no operator without a user; no CLIENT user without a tenant; at most one ACTIVE assignment per conversation; `currentAssignmentId` always points to an ACTIVE assignment; no duplicate external message ids; no issued/paid invoice without a number; no commission without a lead |
| Application tests against restored data | **Not run against the restored copy** (the integration suite writes data and is bound to the standard database). Substituted by: the app's own migration tool succeeding and the read-only integrity queries. Marked as a gap. |
| Missing data / errors / manual steps | none observed; no manual intervention |

**Result: PASS for the procedure and integrity checks on a local database.**

## Earlier run (same script, earlier version, 2026-10-19)

61 tables, identical counts, 28 migrations applied, dump + restore 1 second, 620 KB. Superseded by Run 1.

## What would make this a production test (still required)

1. Obtain the latest production dump from the Backblaze B2 bucket (owner or temporary read key) — compare size and SHA-1 with the nightly upload log.
2. Restore into an isolated `postgres:16-alpine` container, never over production.
3. Run `scripts/restore-verify.sql` and the row-count/migration comparison; record elapsed time and the dump's age.
4. Start a staging copy of the application against the restored database (with synthetic-only staging secrets) and run the read-only smoke checks (`/api/v1/health`, sign in, open dashboards).
5. Record results here with the date, the dump's timestamp and any manual intervention.
