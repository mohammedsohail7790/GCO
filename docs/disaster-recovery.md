# GCO Disaster Recovery

Last verified against the live system: 2026-10-02. Companion to `docs/recovery-runbook.md`
(component-level recovery). This document covers **rebuilding GCO from nothing** and **who or
what holds each recovery dependency**. It contains variable *names* and recovery *sources*
only - never a secret value.

Labels: **VERIFIED** = observed on the live system; **DOCUMENTED** = correct procedure, not yet exercised.

## 0. Facts this plan depends on (read first)

- **Deployment model: workstation -> server.** Code is synchronized from a developer machine into `/opt/gco` (rsync/scp), then `docker compose build` + `up -d` run on the server. VERIFIED.
- **The production server has no GitHub credentials** (no deploy key, token or `known_hosts` entry; `git fetch` from the server fails). It holds a full local git history for `git log`/`git checkout` only; it never pulls. Do not add GitHub credentials to it. VERIFIED.
- **SSH currently has exactly one authorized production key** (`gco-production`, `/home/gco/.ssh/authorized_keys`, perms 600/700). Its private half exists only on Mohammed's workstation. Password login is disabled; root login is key-only. VERIFIED.
- **The `gco` account has full passwordless sudo**, so that single key is effectively root. VERIFIED.
- **Fallback access path: Hetzner Cloud Console** (web console / rescue system). The Hetzner account is owned by Cristian. Whether a console login password exists for `gco` is NOT verified - confirm before relying on it.
- **Backblaze B2 is the offsite destination for PostgreSQL backups** (private bucket `gco-postgres-backups`, server-side encryption enabled, EU region). See section 9 for activation status.
- **`/opt/gco/.env` is the only copy of the production secrets** (mode 600, owner `gco`, not in git). There is no vault or password-manager entry yet (section 15).

## 1. Who holds what

| Dependency | Holder | Recovery path | Documented |
|---|---|---|---|
| Hetzner Cloud account / server | Cristian | Hetzner account recovery | Section 2 |
| Cloudflare (DNS, proxy, SSL mode) | Cristian owns; Mohammed has a DNS-only role | Cloudflare account recovery | Section 5 |
| Zoho Mail org (EU data center) | Cristian = Super Admin/owner/billing; Mohammed = Administrator | Zoho account recovery | Section 6 |
| Domain registrar | External (not Zoho/Cloudflare-registered) | UNKNOWN - confirm and record | No |
| GitHub repo `mohammedsohail7790/GCO` | Mohammed (personal account) | GitHub account recovery | Section 7 |
| SSH production key | Mohammed's workstation only | None (single copy) | Sections 3-4 |
| Backblaze B2 account / bucket / key | Cristian | B2 console; keys are re-creatable | Section 9 |
| UptimeRobot account | Owner | UptimeRobot account recovery | Section 13 |
| `/opt/gco/.env` secrets | Server only | Regenerate (sections 8, 15) | Yes |

## 2. Server provisioning

Hetzner Cloud, Ubuntu LTS, 8 GB class (current: `ubuntu-8gb-nbg1-6`, Nuremberg). Create user `gco` (groups `sudo`, `docker`); `PasswordAuthentication no`, `PermitRootLogin prohibit-password`; `ufw` default-deny with only 22/80/443; `fail2ban` with the `sshd` jail; `unattended-upgrades` enabled; install Docker Engine + Compose plugin and Caddy (apt repo). Create `/var/backups/gco-postgres` (700, `gco`).

## 3. SSH access

Normal path: `ssh -i <production key> gco@<server ip>`. The production key is the only authorized key. If the workstation holding it is lost, SSH access is lost until the fallback in section 4 is used.

## 4. SSH fallback and redundancy

**Fallback:** Hetzner Cloud Console (web console, rescue system, or attach a new key via rescue) - requires Cristian's Hetzner account.

**Recommended second offline key (proposal - NOT applied; requires explicit approval before `authorized_keys` is modified):**
1. On a second trusted device, generate a dedicated recovery key: `ssh-keygen -t ed25519 -f gco-recovery -C gco-recovery` with a strong passphrase. Keep the private key offline (encrypted USB or password-manager attachment), never on a shared machine.
2. Send only the `.pub` file for review.
3. After approval append it (keeping the existing key): `echo '<pubkey>' >> /home/gco/.ssh/authorized_keys`. **Verify the new key logs in from a second terminal before closing the current session.**
4. Rollback: delete the added line.
5. Separately confirm the Hetzner console fallback works (owner: Cristian).

## 5. Cloudflare DNS recovery

Zone `globalconversationoperations.com`, Free plan, DNS setup Full, nameservers `annabel.ns.cloudflare.com` and `armfazh.ns.cloudflare.com`, DNSSEC not enabled, SSL/TLS mode Full (not Full strict). Records (non-secret):

| Name | Type | Content | Proxy |
|---|---|---|---|
| `@` | A | server IP | Proxied |
| `app` | A | server IP | Proxied |
| `@` | MX | `mx.zoho.eu` (10), `mx2.zoho.eu` (20), `mx3.zoho.eu` (50) | DNS only |
| `@` | TXT | `v=spf1 include:zohomail.eu ~all` (exactly one SPF record) | DNS only |
| `@` | TXT | `zoho-verification=<token shown in Zoho>` | DNS only |
| `zmail._domainkey` | TXT | DKIM public key generated by Zoho (selector `zmail`) | DNS only |
| `_dmarc` | TXT | `v=DMARC1; p=none; rua=mailto:founder@globalconversationoperations.com; ruf=mailto:founder@globalconversationoperations.com; sp=none; adkim=r; aspf=r` | DNS only |

On server replacement, change **only** the two A records. Never change nameservers, SSL mode or the mail records as part of a server rebuild. Never add a second SPF record.

## 6. Zoho recovery

Zoho Mail EU (`mailadmin.zoho.eu`), org `gco`, Mail Free plan, domain verified. Mailboxes: `founder@` (Cristian, Super Admin) and `mdsohail@` (Administrator). If DNS mail records are lost, re-publish them from section 5; Zoho Admin Console > Domains > Email Configuration shows the exact MX/SPF/DKIM/DMARC values and a Verify button. If DKIM must be regenerated, create a selector in Zoho and publish the TXT it displays. Mail authentication was tested end to end (SPF, DKIM, DMARC all PASS in Gmail).

## 7. Source-code recovery

Authoritative source: GitHub `mohammedsohail7790/GCO` (personal account of Mohammed) plus working copies on developer workstations. The server's `/opt/gco` also holds a full local git history and a complete working tree, usable as a recovery source for the code (copy it off with rsync). Risk: single GitHub owner. Recommended (not done): add a second owner or move to an organization.

## 8. `.env` reconstruction and environment audit

`/opt/gco/.env` is consumed by `web`, `worker`, `realtime` (`env_file`) and, through compose substitution, `postgres` (only `POSTGRES_*`). `redis` consumes none. `DATABASE_URL` and `REDIS_URL` are not set in `.env`; compose derives them.

| Variable | Secret | Required | Consumers | Recovery source | If lost |
|---|---|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes | Yes | postgres, web, worker, realtime | Regenerate (`openssl rand -base64 24`) | App cannot connect until set; regenerable, no data loss (section 12) |
| `AUTH_SECRET` | Yes | Yes | web, worker, realtime | Regenerate (`openssl rand -base64 48`) | Sessions invalidated (section 14) |
| `OPENAI_API_KEY` | Yes | No while `AI_PROVIDER=mock` | **worker only**, via `/opt/gco/.env.ai` (0600 `gco:gco`, git- and docker-ignored; compose `env_file` entry on the worker service only; `.env` keeps an empty placeholder) | OpenAI dashboard: create a new key; re-enter with `scripts/setup-openai-key.sh` | AI stays on the mock provider; nothing breaks. Stored and authenticated 2026-10-04 (`GET /v1/models` = 200); **not activated** (`AI_PROVIDER=mock`) |
| `SENTRY_DSN` | Yes | No (empty) | web | Sentry project, if ever enabled | Nothing today |
| All other variables | No | Yes | per below | This table | Behavior reverts to defaults |

Non-secret values to recreate exactly:

```
NODE_ENV=production
POSTGRES_USER=gco
POSTGRES_DB=gco
NEXT_PUBLIC_SITE_URL=https://globalconversationoperations.com
NEXT_PUBLIC_REALTIME_URL=wss://app.globalconversationoperations.com/realtime
REALTIME_PORT=3001
AUTH_TOKEN_TTL_MINUTES=60
AUTH_REFRESH_TTL_DAYS=30
AI_PROVIDER=mock
OPENAI_MODEL=gpt-4o-mini
AI_REQUEST_TIMEOUT_MS=8000
FEATURE_AI_SUGGESTIONS=true
FEATURE_AI_MEMORY=true
FEATURE_AUTO_REASSIGNMENT=true
FEATURE_CLIENT_TICKETS=true
FEATURE_EMERGENCY_CONTROLS=true
FEATURE_ADVANCED_ANALYTICS=false
DEFAULT_OPERATOR_CAPACITY=2
DEFAULT_RESPONSE_SLA_SECONDS=120
DEFAULT_PRICE_PER_MESSAGE_EUR=0.14
DEFAULT_OPERATOR_COST_PER_MESSAGE_EUR=0.06
FOUNDER_REVENUE_SHARE_PERCENT=5
LOG_LEVEL=info
CALENDLY_SCHEDULING_URL=
```

Activating OpenAI is a separate decision (set `AI_PROVIDER=openai`, recreate the worker): it would send conversation content to a third party and double per-message AI calls while `FEATURE_AI_SUGGESTIONS` and `FEATURE_AI_MEMORY` are true. To rebuild: recreate `/opt/gco/.env.ai` with the interactive script, then `docker compose up -d --no-deps worker`.

`NEXT_PUBLIC_*` values are compiled into the web build; changing them requires a rebuild of the images. Absent by design: `S3_*`, `AIRTABLE_*`, `DEV_WEBHOOK_SECRET`, `APP_URL`, `APP_NAME`. Not present anywhere in this system: Twilio, Deepgram, ElevenLabs, Zapier, ServiceTitan, Jobber, Housecall Pro, Docker registry or GitHub credentials. Never copy `.env` into git, chat, or an unencrypted backup.

## 9. Backblaze B2 offsite backups and B2 restore

Flow: `pg_dump -Fc` -> local file in `/var/backups/gco-postgres/` -> `pg_restore --list` integrity check -> upload to B2 as `gco-postgres/<same filename>` -> verification -> local retention sweep (14 days, unchanged).

- Uploader `scripts/b2-upload.py` (Python standard library, TLS, nothing installed). Credentials come only from the environment (`B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY`) via systemd `EnvironmentFile=/etc/gco-backup-b2.env` (root:root 0600, created interactively by `scripts/setup-b2-credentials.sh`, which prints lengths and capability names only). Never arguments, never logged, never in git (`.gitignore` guards the filename).
- Key: bucket-scoped (`gco-postgres-backups` only). **Finding (verified 2026-10-04):** the Backblaze console's "Write Only" preset still grants `deleteFiles` and several bucket-settings capabilities (`writeBucketEncryption`, `writeBucketLifecycleRules`, `writeBucketReplications`, `writeBucketLogging`, `writeBucketNotifications`) in addition to `writeFiles` and `listBuckets`. It has no `listFiles`/`readFiles`. A compromised server could therefore delete offsite backups. A key with only `writeFiles` can be created with the B2 CLI/API (not the console); replacing the key is recommended and needs the account owner. The uploader needs `writeFiles` only; without `listFiles` it verifies from B2's upload response (name, size, SHA-1), and `--check` warns about excess capabilities.
- Failure semantics: exit 1 = local backup failed; **exit 2 = local backup OK but offsite copy failed** (service shows `failed`, local dump kept). Missing credentials count as an offsite failure.
- Remote retention: not configured (bucket lifecycle is "keep all versions"). Proposal: 30 days via a B2 lifecycle rule, to be approved before enabling.
- **Restore from B2:** a Write Only key cannot download. Download `postgres/<file>` through the B2 web console or a temporary read-scoped key, compare size and SHA-1 with the `b2: verified ...` line in `journalctl -u gco-backup-postgres.service`, then follow section 12 (isolated validation first).
- Limitation: dumps contain all production data including plaintext webhook secrets (section 15). Protections: private bucket, server-side encryption, scoped key. Client-side encryption is deferred until a key-recovery vault exists.
- **Activation status (2026-10-04): ACTIVE.** First verified upload: `gco-postgres/gco-postgres-20261004T174710Z.dump`, 623,997 bytes, SHA-1 matched the local file. The nightly timer (03:30 UTC, `Persistent=yes`) now uploads every dump. Failure test (bogus credentials) confirmed exit code 2 with the local dump retained. No credential value appeared in any log.

## 10. Docker/Compose recovery

`cd /opt/gco && docker compose build web worker realtime && docker compose up -d`. All five services (`web`, `worker`, `realtime`, `postgres`, `redis`) use `restart: unless-stopped`; web, realtime, postgres and redis have healthchecks; `web` and `realtime` bind to `127.0.0.1` only; postgres and redis publish no ports. Volumes `gco_gco_postgres_data` and `gco_gco_redis_data` persist independently of containers. Per-container recovery is in `docs/recovery-runbook.md`.

## 11. Caddy/HTTPS recovery

`/etc/caddy/Caddyfile` is a symlink to `/opt/gco/Caddyfile`, so restoring the source restores the proxy config (`ln -s /opt/gco/Caddyfile /etc/caddy/Caddyfile`; `systemctl restart caddy`). Certificates (Let's Encrypt, one per hostname) are re-issued automatically once DNS points at the server (HTTP-01 on port 80); no secret is needed. Cloudflare serves its own edge certificate to visitors; Caddy's certificate protects the Cloudflare-to-origin leg. Realtime is proxied at `/realtime` to `127.0.0.1:3001`.

## 12. PostgreSQL restore

Dumps are `pg_dump -Fc`, named `gco-postgres-<UTC timestamp>.dump`. **Validate into an isolated container first** (VERIFIED procedure, `docs/recovery-runbook.md` section 8):

```bash
docker network create gco-restore-test
docker run -d --name gco-restore-pg --network gco-restore-test -e POSTGRES_PASSWORD=<throwaway> postgres:16-alpine
docker exec -i gco-restore-pg pg_restore -U postgres -d postgres --no-owner < <dump>
docker exec gco-restore-pg psql -U postgres -c '\dt'                          # expect 33 tables
docker exec gco-restore-pg psql -U postgres -c 'SELECT count(*) FROM _prisma_migrations;'
docker rm -f gco-restore-pg && docker network rm gco-restore-test
```

Real recovery: stop `web worker realtime`, then `docker compose exec -T postgres pg_restore -U gco -d gco --clean --if-exists < <dump>`, then start them. This overwrites current data; DOCUMENTED, never run against live production. After restoring on a fresh volume, set the role password to the new `POSTGRES_PASSWORD` (dumps contain no role passwords).

## 13. Monitoring recovery

External uptime monitoring uses UptimeRobot (owner account). Intended monitors: `https://globalconversationoperations.com`, `https://app.globalconversationoperations.com/login`, and the public `/api/v1/health`. Their actual state is recorded in the hardening report. Monitors target hostnames, so they follow DNS; a rebuilt server needs no monitoring change. Never monitor `/api/v1/admin/system-health` (authenticated; exposes internal error detail) or any internal port. A standard HTTPS monitor sees Cloudflare's certificate, not Caddy's origin certificate.

## 14. AUTH_SECRET recovery

- **What it protects:** only the HS256 signing and verification of access tokens (60 min) and realtime tickets (30 s) - `lib/auth/tokens.ts` and `middleware.ts`. VERIFIED by reading the code.
- **What it does not do:** it does not encrypt or hash any stored data. Refresh tokens are random values stored in the database (`Session` table) and are independent of it.
- **If it must be replaced:** rotation invalidates existing JWT sessions (all issued access tokens and realtime tickets stop verifying; users with a valid refresh cookie should obtain new tokens through `/api/v1/auth/refresh`, otherwise they sign in again). It does **not** destroy persisted application data.
- **If the original is unavailable:** generate a new one (`openssl rand -base64 48`), put it in `.env`, recreate `web worker realtime`. There is no way, and no need, to recover the old value.
- Do not rotate it casually; it is a deliberate, separate decision.

## 15. Integration webhook-secret recovery

- Each integration has its own HMAC secret, stored as a **plaintext database column** (`Integration.webhookSecret`), never returned by any API response.
- **Consequence:** the secrets are included in every PostgreSQL dump. The offsite database backup is therefore what protects them, and **losing every copy of the database backup loses the ability to recover them** - they would have to be re-issued per integration (`PATCH /api/v1/admin/integrations/:id/webhook-secret`) and each client updated, since a rotation invalidates the old value immediately.
- Treat dumps (local and in B2) as highly sensitive: private bucket, restricted permissions, no public access, no sharing.
- Not rotated, not read, and no schema change was made as part of this work.

## 16. Rebuild checklist (fresh Ubuntu server)

1. Provision (section 2), then confirm SSH access (section 3).
2. Rsync the source to `/opt/gco` from a workstation (section 0 - the server cannot pull).
3. Create `.env` (section 8) with newly generated secrets.
4. Link the Caddyfile and restart Caddy (section 11).
5. `docker compose build` and `up -d` (section 10).
6. Restore the database (section 12) from the newest local or B2 dump, before sending traffic.
7. Cloudflare: change only the `@` and `app` A records (section 5).
8. Backups: install `deploy/systemd/gco-backup-postgres.{service,timer}` into `/etc/systemd/system/`, run `scripts/setup-b2-credentials.sh`, `systemctl daemon-reload`, `systemctl enable --now gco-backup-postgres.timer`.
9. Smoke tests: `curl https://globalconversationoperations.com/api/v1/health` (`healthy:true`), pages return 200, CEO_ADMIN login works, realtime connects, `docker ps` all healthy.

## 17. Known gaps

- No password-manager/vault entry for `.env` secrets (RED).
- Single SSH key (RED) - section 4.
- GitHub repo owned by one personal account; server cannot pull (YELLOW).
- Hetzner, Cloudflare, Zoho and registrar recovery are not independently documented and depend on Cristian (YELLOW).
- No alert on backup failure beyond the failed systemd unit.
- Remote backup retention and client-side encryption undecided; the B2 key is over-privileged (can delete and change bucket settings). **Accepted risk (owner decision, 2026-10-04): keep the current key for now.** To reduce it later, Cristian creates a `writeFiles`-only key with the B2 CLI (`b2 key create --bucket gco-postgres-backups --name-prefix gco-postgres/ <name> writeFiles`), it is entered with `scripts/setup-b2-credentials.sh`, verified with one real backup, and only then are the two older keys (IDs ending 0001 and 0002) deleted in the B2 console.
- Leftover from testing: two extra local dumps (created by the failure test) age out under the 14-day retention; they were never uploaded.
