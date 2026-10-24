# 20 — Staging deployment, encrypted backups and rollback plan (for the CEO's review)

**Status:** plan only. **Nothing here has been run on the server.** Approved by the CEO on 2026-10-23: the read-only server resource assessment, and encrypted backups tested on staging first. **Not yet approved:** deploying staging. Production changes need the CEO's separate approval.

## 1. Step 0: read-only server resource assessment (approved)
Run by the CTO over SSH, **no write commands**, output saved and sent to the CEO.
| Question | Read-only command |
|---|---|
| Memory and swap headroom | `free -m` ; `cat /proc/meminfo \| head -5` |
| Real memory used by each production container | `docker stats --no-stream` |
| CPU count and load | `nproc` ; `uptime` |
| Disk space and growth | `df -h` ; `du -sh /var/lib/docker 2>/dev/null` ; `ls -lh <backup dir>` |
| Is Docker and Compose present and which versions | `docker --version` ; `docker compose version` |
| What is listening (confirm Postgres and Redis are not public) | `ss -tlnp` |
| Existing Caddy config and certificates healthy | `caddy validate --config /etc/caddy/Caddyfile` (validates only; does not reload) |
| Current backup timers | `systemctl list-timers --all \| grep -i gco` |
**Decision gate:** proceed only if **at least 1.5 GB of memory remains free and about 10 GB of disk** after production load at peak. Otherwise stop and bring the CEO the options (smaller staging, run on demand, or a second small server with a quote for approval). I make no purchase.

## 2. Staging implementation (only after the CEO approves)
Staging is already defined in the repository (`docker-compose.staging.yml`, project name `gco-staging`, bound to `127.0.0.1:3200/3201`, its own volumes, `deploy/staging/*`, a Caddy block with a password gate). Fictional data only.
**Protections for production:**
1. **Resource limits on every staging container** (memory and CPU caps). The compose file has none today; I add them in the repository first (e.g. total staging ceiling about 1.2 GB) so staging cannot starve production.
2. **Fresh production backup, verified** (`pg_restore --list` plus a restore drill) **immediately before** any change. The existing Hetzner backups option is the second safety net.
3. **Separate everything:** separate Compose project and volumes, separate `.env.staging` with different secrets, no shared network with production, no production data, no real credentials.
4. **Do the Caddy change last and safely.** The staging block sits in the same Caddyfile as production and **fails to load if the password file is missing**. Order: create `/etc/caddy/staging-auth` first → `caddy validate` → **reload (not restart)** → verify the production sites still return 200. Keep a copy of the previous Caddyfile.
5. **DNS:** one proxied `A` record `staging` (a Cloudflare change that needs the CEO's approval). Until it exists staging is reachable only by SSH tunnel.
6. Staging is brought up **outside business hours**, with the CTO and a production health check open (`/health` and the two site URLs).
**Verification after bring-up:** staging health OK, login with fictional accounts, run the E2E suite against staging (`E2E_BASE_URL`), confirm production responses and response times unchanged.

## 3. Staging rollback (any time, production untouched)
1. `docker compose -f docker-compose.staging.yml down` (keep volumes), or `down -v` to discard data.
2. Remove the staging block from the Caddyfile (restore the saved copy), `caddy validate`, **reload**.
3. Remove the `staging` DNS record.
4. If production is slowed: stop staging first, confirm recovery, then investigate.
5. Worst case: restore from the verified backup and the Hetzner backup option.

## 4. Encrypted backups (approved: staging first)
**Design (age, a free, simple file-encryption tool [verify availability on the server's OS]):**
- The CEO generates an **age key pair on his own EU machine**. Only the **public key** goes on the server and into configuration. The **private key never touches the server or the CTO's machines.**
- `scripts/backup-postgres.sh`: keep the existing dump and the existing integrity check; then **encrypt the dump** (`age -r <public key> -o file.dump.age file.dump`), write a checksum, upload the `.age` file to B2, and verify the upload. The plaintext dump is removed from the server after a verified encrypted copy exists, following the existing retention rules.
- **Two recipients** so one lost key does not lose the backups: the CEO's primary key and a second recovery key stored separately.

**Key management (recoverable, not a single point of failure):**
| Item | Rule |
|---|---|
| Custody | CEO holds the private key in two independent offline places (for example an encrypted password manager entry plus a sealed offline copy in a separate location). The CTO holds no private key. |
| Second custodian | A trusted EU person holds a sealed recovery copy with written instructions, so recovery does not depend on the CEO being reachable. [Who: CEO to decide; note this is a person with access to the means to read backups, so treat them as a processor-side person.] |
| Test | At setup and then every quarter: decrypt a recent backup using the stored key, restore it into a scratch database and compare record counts. A key that has never been tested is not a key. |
| Rotation | Yearly, or after any suspected exposure: add the new recipient first, keep the old key for older backups, retire it when those age out. |
| Loss | If both copies are lost, encrypted backups are unreadable. Mitigation: the second custodian, the quarterly test, and the Hetzner server backups option, which is a separate, provider-level copy. |

**Restoration test on staging (required before any production change):**
1. On staging, run the modified backup script against **fictional** data; confirm an encrypted file appears in a **test B2 location** (a separate prefix or bucket, no production data).
2. Download it, decrypt with the CEO's private key (or the recovery key, as a separate test), restore it with the existing `scripts/restore-production-dump.sh`/`restore-drill.sh` (extended to accept decrypted input), and confirm the verification counts and `restore-verify.sql` pass.
3. Record the result and times in a report beside `04-backup-restore-test-report.md`.
4. **Only then** ask the CEO for approval to change the production backup job. Rollback of that change: restore the previous script and run one plain backup immediately.

## 5. Approvals and costs
| Step | Needs CEO approval | Cost |
|---|---|---|
| Read-only assessment | Approved | €0 |
| Deploy staging, add DNS record, change Caddy | **Yes** | €0 if memory allows; a second server only with a quote |
| Encrypted backup on staging | Approved to test | €0 |
| Change the production backup job | **Yes, separate** | €0 |

## 6. Progress log (2026-10-23, local machine only; nothing on any server)
**Built (uncommitted):** `scripts/encrypt-backup.sh`, `scripts/decrypt-backup.sh`; `scripts/backup-postgres.sh` encrypts when `/etc/gco-backup-age-recipients.txt` exists (the encrypted file is the only copy kept and uploaded; without the file nothing changes); `scripts/restore-production-dump.sh` accepts `.dump.age` with `AGE_IDENTITY_FILE`. Tool: **age v1.3.2** (author's GitHub release; the downloaded file matched the sha256 digest GitHub publishes for it; I could not verify the author's signature proofs, so the CEO should also confirm the version on his own machine).
**Tested here, on the local test database only:**
| Check | Result |
|---|---|
| Encrypt a real dump to two recipients | OK; output is an age file, no dump header |
| Decrypt with the primary key / the recovery key | Both OK, **byte-identical** to the original |
| Decrypt with a wrong key | Fails (exit 3), no output file left |
| Refuse one recipient; refuse a private key in the recipients file | Both refused (exit 2), nothing written |
| Full restore from the `.age` file through `restore-production-dump.sh` | **PASS**: 29 migrations, 61 tables, 14 integrity checks with 0 violations; decrypted temp file removed |
**Not tested:** running `backup-postgres.sh` itself (it needs Docker and the production layout), the upload of a `.age` file to B2, and anything on a server. Those happen on staging, then production with the CEO's approval.
**Important behaviours to know:** with encryption on, the server keeps **only** the encrypted file, so **every restore needs the CEO's key** (that is the point, and the risk). Keep both keys, and run the quarterly decrypt test.

## 7. Key generation: exact steps for the CEO (on his own machine, not the server)
1. Install **age** from its official release page (or your package manager) and note the version (`age --version`).
2. Create two keys, in a private folder: `age-keygen -o gco-backup-primary.txt` and `age-keygen -o gco-backup-recovery.txt`. Each prints a line starting `Public key: age1...`.
3. **Store each private file in a different offline place** (see key management in section 4). Never email, chat or commit a private key. Test that you can open both.
4. Send the CTO **only the two public-key lines** (`age1...`). They are safe to share.
5. On staging first, the CTO creates `/etc/gco-backup-age-recipients.txt` with those two lines (owner root, mode 644), installs `age` on the server (a server change: the CEO approves), and runs one backup.
6. The CEO downloads the encrypted file and runs the decrypt and restore test (section 4, step 2). Production only after that passes and he approves.
