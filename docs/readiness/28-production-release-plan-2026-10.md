# 28 — Production release plan (NOT EXECUTED — waiting for the CTO's confirmation of this plan)

Prepared 2026-10-27. **Nothing in this document has been run on the server.** The only production contact so far was read-only (`git log`, file listing, `df`, `free`, row counts, secret *length*, `docker compose ps`).

## 1. Why this is a full release, not a one-file fix
The AI-draft fix (`app/api/v1/conversations/[id]/suggestion/route.ts`) imports `lib/ai/guard.ts`, which does not exist on the server. The server runs commit `d9af8dc` (plus uncommitted 2FA files), so deploying the fix means deploying everything built since: **379 files changed, 13 new database migrations, ~16,000 lines**. The CEO has approved the full release.

## 2. What the server runs today (read-only observations, 2026-10-27)
| Fact | Value |
|---|---|
| Server tree | git `d9af8dc` + uncommitted changes (2FA, account page, inside-gco, login route, schema) — a past deploy came from an uncommitted workstation tree |
| Migrations applied | 16 (latest `20261012065733_two_factor`) → **13 to apply**, 29 in total after this release (the G3 rehearsal on the real dump confirmed 16 → 29) |
| Data | 18 MB database; 1 tenant, 7 users, 1 message — no real client data yet |
| Capacity | disk 64 GB free of 150 GB; RAM 7.7 GB total, ~5.5 GB available |
| Services | postgres, redis, realtime, web, worker all up/healthy (web, worker 2 weeks) |
| Backups | nightly dumps in `/var/backups/gco-postgres` (latest 27 Oct 03:31, 900 KB), timer active; `age` not installed (encryption stays off — see §6) |
| `AUTH_SECRET` | 64 characters (the new 32-character minimum is satisfied) |
| `AI_PROVIDER`, `FEATURE_AI_*` | present in `.env`; values were deliberately not read |

## 3. What the release changes (and what it does not)
**Changes:** AI master switch (compose pins `AI_MASTER_SWITCH: disabled` for web, worker, realtime → AI off regardless of `.env`); suggestion endpoint returns no draft when AI is off; new modules (earnings ledger, billing/invoices, privacy tools, moderation, shifts, training, knowledge, client requests, supervisor/CTO roles) — all additive and dormant until used; optional two-factor policy; report-only security headers (CSP is *report-only*, nothing is blocked; HSTS not enabled); health endpoint no longer echoes driver errors; 13 additive migrations.

**Behaviour change to confirm with the CEO:** `docs/disaster-recovery.md` says OpenAI is active for the worker via `/opt/gco/.env.ai`. After this release the worker makes **no AI calls** (switch disabled). That matches "keep AI off", but if production is currently calling OpenAI, this release turns that off.

**Deliberately NOT touched:** `Caddyfile` (the new file adds a staging block that fails to load without `/etc/caddy/staging-auth`; it is excluded from the sync and Caddy is not reloaded), `.env`, `.env.ai`, DNS, Cloudflare, systemd timers (new retention/weekly/alerts timers stay uninstalled), backup encryption, `HSTS_MAX_AGE_SECONDS`, Workspace/email.

**Scan of the 13 migrations:** no `DROP`, `DELETE`, `TRUNCATE`, type change, or `NOT NULL` column without a default. All add tables/columns/enum values. Local checks: empty database → all migrations → exact match with `schema.prisma` (PASS, earlier session).

## 4. Gates — all must pass before any production command
| # | Gate | How | Status |
|---|---|---|---|
| G1 | Tests green on the exact commit being shipped | typecheck, lint, unit, integration (real Postgres/Redis), E2E on a local build | unit 721 passed today; integration 219/219 on the second full run (one intermittent failure on the first, see §9); E2E and build to be re-run on the final commit |
| G2 | Deploy from a clean, committed, pushed commit | commit the pending test and docs, push, ship `git archive <commit>` — never the dirty workstation tree | pending (needs your OK to commit/push) |
| G3 | Rehearsal on the server in a throwaway database | restore the latest dump into a temporary Postgres container, run `prisma migrate deploy` from the **new image**, run integrity checks, delete the container | pending |
| G4 | CEO's written go + a window | proposed: a low-traffic window; expected downtime 2–5 minutes | CEO approved release in principle; window to be agreed |
| G5 | Fresh backup + code snapshot immediately before | steps 1–3 below | at execution |

## 5. Execution steps (run only after you confirm this plan)
All on the server as `gco`, via the single authorised key, in `/opt/gco`. Each step stops the procedure on failure.

1. **Fresh database backup:** `/opt/gco/scripts/backup-postgres.sh` (uses the same script as the nightly timer). Confirm a new dump file and its size; copy the file name into the log.
2. **Code snapshot:** `tar czf /var/backups/gco-code-pre-release-$(date -u +%Y%m%dT%H%M%SZ).tgz --exclude=node_modules --exclude=.next --exclude='.env*' -C /opt gco` (chmod 600). Secrets are not in this archive and are not changed by the release.
3. **Tag the running images** so rollback needs no rebuild: `for s in web worker realtime; do docker tag "$(docker compose images -q $s)" "gco-$s:pre-release-20261027"; done` (check the image names first with `docker compose images`).
4. **Sync the release** from the clean export: `rsync -rc --exclude node_modules --exclude .next --exclude .git --exclude '.env' --exclude '.env.*' --exclude Caddyfile` (no `--delete`). Dry-run first and compare with this plan: 345 files change, `Caddyfile` must **not** appear.
5. **Rehearsal (gate G3)** — before touching live services: `docker compose build web worker realtime`, then run the new web image against a throwaway Postgres restored from the dump from step 1: `prisma migrate deploy` must apply 13 migrations; run `scripts/restore-verify.sql` checks; remove the throwaway container and network.
6. **Apply to live:** `docker compose up -d --no-deps --force-recreate web`, then `docker compose exec -T web npx prisma migrate deploy` (the new image carries the Prisma CLI and the 13 migrations), then `docker compose up -d --no-deps --force-recreate worker realtime`. Migrations are additive, so the old worker/web code keeps working against the new schema during the few seconds between steps.
7. **Verify (§7).** If any check fails, execute §8 immediately.

## 6. After-release verification checklist
| Check | Expected |
|---|---|
| `docker compose ps` | web, worker, realtime, postgres, redis up; web healthy |
| `GET /api/v1/health` (public) | `ok`, AI shown as `disabled`, no driver error text |
| `_prisma_migrations` count | 29 finished, none failed |
| `AI_MASTER_SWITCH` inside web/worker/realtime | `disabled` (`docker compose exec web printenv AI_MASTER_SWITCH`) |
| Operator panel on a conversation with an old stored draft | **no draft shown** (the bug) |
| Log in as the CEO account, as an operator, as a client | works (sessions: existing users signed in stay valid — `AUTH_SECRET` unchanged) |
| Public website, `app` login page | load; response carries `Content-Security-Policy-Report-Only` |
| Nightly backup timer | still active (`systemctl list-timers`); next run succeeds |
| Worker log | no errors for 10 minutes; no OpenAI calls |

## 7. Rollback
**Code rollback (fast, ~3 minutes):** `docker tag gco-<svc>:pre-release-20261027` back to the compose image names (or restore `/var/backups/gco-code-pre-release-*.tgz` over `/opt/gco` and `docker compose build`), then `docker compose up -d --force-recreate web worker realtime`. Because every migration is additive (new tables, new nullable/defaulted columns, new enum values), the **old code runs unchanged against the new schema** — no schema rollback is needed for a code rollback.

**Database rollback (only if data is damaged — a last resort):** stop web, worker and realtime; restore the dump from step 1 with `pg_restore` into the live database (`--clean --if-exists`), restart on the old images. Anything written after step 1 is lost; with 1 message in the system today the loss is negligible, which is why the window should be early, before real use starts. Prisma has no automatic down-migrations; do not hand-reverse migrations.

**Not rollbackable:** emails/notifications sent, users created through new flows. The release enables none of them automatically.

## 8. Risks (honest list)
| Risk | Level | Mitigation |
|---|---|---|
| 13 migrations on production never run before | Medium | additive-only scan; rehearsal on the real dump in a throwaway container (G3); fresh dump; DB tiny (18 MB) |
| Server tree differs from git (uncommitted history) | Medium | deploy from a clean commit; code snapshot kept; rollback images tagged |
| Docker build on a 7.7 GB server | Low–Medium | ~5.5 GB available; build before the switch; web stays up during the build |
| 379 files of new code, only tested locally | Medium | G1 on the exact commit; verification checklist; rollback ready |
| Existing signed-in sessions and 2FA seeds | Low | `AUTH_SECRET` unchanged; the 2FA code already runs in production |
| Worker stops AI calls | Intended | confirmed against "keep AI off"; CEO to be told |
| Realtime/WebSocket path | Low | tested locally; included in verification |
| Docker image rollback was never exercised | Medium | tagged images + tarball; step 6 order keeps old code compatible |

## 9. Test evidence for the release (this session)
- Unit: 47 files, 721 passed.
- Typecheck/lint: clean on the pending docs/tests state (last run this session before the plan).
- Integration on commit `4446946` (real PostgreSQL + Redis): first run 218 passed, **1 failed** (`moderation` claims-under-concurrency test) — that run followed an earlier run I had killed mid-way, so stale rows are a suspect but unproven; the file alone passed twice; the second full run passed **219 of 219**. Treat as a known intermittent test (it was also seen flaky earlier in the project) until the cause is shown.
- E2E and production build: to be re-run on the final commit before G1 is declared passed.

## 10. What I need from you
1. Confirm the plan (or change it).
2. Say whether I may commit and push the pending test and docs (needed for G2).
3. Agree a window with the CEO and tell him the worker stops AI calls.
4. Then I run G1 → G3 and report; **execution of §5 steps 1–7 only after a second confirmation from you.**

## 11. Gate results (2026-10-27, commit `db12634`, pushed on branch `fix/suggestion-respects-ai-switch`; `main` untouched)
**G3 — rehearsal on the server: PASS.** In a separate directory and Docker network (nothing under `/opt/gco` or `/opt/gco-staging` was touched; production containers stayed healthy throughout):
- image built from the exact commit (about 1–2 minutes; free memory never below ~136 MB "free" with ~5.4 GB available);
- last night's production dump (27 Oct 03:31, 880 KB) restored into a throwaway PostgreSQL;
- `prisma migrate deploy` from the **new image**: all migrations applied, **16 → 29, 0 failed**; row counts unchanged (7 users, 1 tenant, 1 message);
- `restore-verify.sql`: **all 14 integrity/tenant-boundary checks = 0 violations**;
- the new web image started against that database with `AI_MASTER_SWITCH=disabled`: `/api/v1/health` returned healthy with `ai: {enabled:false, mode:"disabled"}`;
- cleanup verified: no rehearsal containers, images, networks or directories left; log kept at `~/g3.log` on the server.
Not covered by G3: login/2FA on real accounts (passwords are not available), the operator panel with an old draft (covered locally by `suggestionAiOff` integration test), the real Docker Compose recreate sequence and rollback (never exercised on this server).

**G1 — tests on `db12634`: PASS, with one test edit pending.** typecheck 0 errors, lint 0 problems, unit 730/730, integration 219/219 (one intermittent failure on the first full run, see §9), production build OK. End-to-end on a local AI-**off** stack (the production posture): **296 passed, 2 skipped, 3 failed** — the 3 were: spec `01` (AI suggestion step) and `08` (AI memory), which test AI features and are expected to fail with AI off; and spec `44` (AI mode), which failed because the fixed endpoint now answers `aiMode: "DISABLED"` when the AI switch is off and the test expected `"HUMAN_ONLY"`. Spec `44` was corrected (accepts either value; still requires no draft) and passes on the AI-off stack; **that test edit is not yet committed**, so the pushed commit `db12634` still has the old expectation. An earlier E2E attempt in this session was invalid (my local test server had died) and was discarded.

**G2 — clean pushed commit:** `db12634` is pushed to the branch; to ship the corrected test, one more commit would be needed, which changes the commit that G3 rehearsed (test-only change, no application code difference). Decide whether to re-tag the release at the new commit or ship `db12634` as-is.
