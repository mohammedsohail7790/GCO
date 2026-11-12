# 55 — Isolated server rehearsal of the release (11–12 Nov 2026): report

**Authority:** CEO, 12 Nov: tag and push the tested version; run the isolated server rehearsal with production services, data and configuration untouched; check resources first and stop at any risk; send the complete report before any live deployment is considered.
**Release under test:** tag `rc-20261112-33migrations` (commit `65d250a`, branch `claude/production-security-release-5e5488`, pushed to GitHub 12 Nov). 33 migrations. **Not deployed.**

## 1. What the rehearsal does and does not touch
It ran as user `gco` in its own folder, its own Docker network and its own throw-away containers, built one image, and removed everything at the end. It **never** touched `/opt/gco`, the production containers, volumes, ports, `.env` files, systemd units or the production database; it printed no secret; nothing left the server; nothing was bought. It **read** the newest nightly backup file (as a copy, mode 0600, deleted at the end). That copy contains the real staff and applicant records (7 users, 1 tenant, 1 conversation, 1 message in this dump), so it stayed on the server.

## 2. Resource checks before and during
Before: 5,578 MB memory available, no swap used, load 0.11, 58 GB disk free, all five production services healthy, `age` installed. **During run 2** I sampled the server every 45 seconds from outside: memory available stayed between **5,048 and 5,670 MB**, the production health page answered healthy every time, and all five services stayed up. Nothing came near the stop threshold (the script stops by itself below 1,800 MB).

## 3. Run 1 (11 Nov 20:11 UTC): FAILED because of two defects in my script, not in the release
| What happened | Cause | Fix |
|---|---|---|
| `prisma migrate deploy` failed: permission denied on `prisma/schema.prisma` | The script created the source files with owner-only permissions; the Docker image copied them as they were, so the non-root user inside could not read them | The source is now extracted with normal read permissions (the folder and the dump copy stay private) |
| "Integrity checks" showed PASS although a table was missing | The check counted only violation lines; an SQL error produced none | The script now fails if the integrity script errors, and the sections that depend on the migration are marked as not valid when it failed |
Run 1 also showed, correctly: rollback restored the original state, and an encrypted round trip with throw-away keys worked. The "old image on the new schema" PASS in run 1 was **not valid** (the schema had not been migrated) and is not counted. Run 1 left nothing behind and production stayed unchanged.

## 4. Run 2 (12 Nov 06:15 UTC): PASS
| Check | Result |
|---|---|
| Source dump | newest nightly backup, 12 Nov 03:30 UTC, 902,905 bytes, restored with 0 warnings |
| State before | 1 tenant, 7 users, 1 conversation, 1 message, **16 migrations** |
| Migrations applied from the new image | **33** (16 to 33), **0 failed or rolled back** |
| Rows after | unchanged (1 / 7 / 1 / 1) |
| Integrity script (`restore-verify.sql`) | ran without error; **0 violations** |
| New web image started against the migrated copy | **healthy; reports AI disabled** |
| **Code rollback:** the **old production web image** on the migrated schema | **healthy** |
| Old worker on the migrated schema, 20 seconds | **0 error lines** |
| **Database rollback:** drop schema, plain `pg_restore` of the dump | back to **16 migrations, same rows**, **0** new-schema tables left |
| **Encrypted backup round trip** (throw-away keys, two recipients, decrypt with the second key) | **decrypted file identical to the original** |
| Cleanup | 0 containers, 0 networks, 0 images, folder removed; **production services unchanged** |
**Overall: PASS.** Full text reports: run 1 `/home/gco/gco-rehearsal-report-20261111T201150Z.txt`, run 2 `/home/gco/gco-rehearsal-report-20261112T061514Z.txt` (on the server); the run 2 content is reproduced above.

## 5. What this proves and what it does not
**Proves:** the 17 new migrations apply cleanly to a copy of the **real** production data; the new application starts healthy with AI disabled on the migrated data; the **old** application keeps running on the new schema (so a code rollback does not need a database rollback); a database rollback restores the original state; an encrypted backup can be decrypted with the recovery key and is identical to the original.
**Does not prove:**
- the real live deployment steps (rsync of the release, `docker compose` recreate and image re-tag on the production stack), which cannot be isolated;
- sign-in on restored data and the full smoke test on the live stack;
- **the real-key encrypted recovery** (these were throw-away keys): that is the key session and the staging proof;
- the **offsite (Backblaze) restore**;
- behaviour with a larger production database: the real data is tiny (1 tenant, 7 users).
**Files left on the server by me, outside the rehearsal's cleanup:** `~/release-rc-20261112.tar.gz` (the source of the tagged release, no secrets), `~/rehearsal-tool/`, and the two report files and run outputs in `~`. They can be removed on request; they are not in `/opt/gco`.

## 6. Still required before a live deployment is proposed
Real-key encrypted backup and offsite restore (13 Nov session onward); restricted Backblaze key; 2FA enforcement plan with the CEO enrolled first; alerts and monitoring installed and tested; the operator coverage drill; the written deployment approval naming a window. The updated gate list is `48` section 4 and `54`.
