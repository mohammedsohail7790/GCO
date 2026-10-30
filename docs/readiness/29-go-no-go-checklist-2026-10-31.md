# 29 — Go/no-go checklist, release window Saturday 31 Oct 2026, 07:00–09:00 (Italy)

Fallback window: Sunday 1 Nov 2026. Release commit: `ec59f38` plus later docs-only commits. Detailed steps and rollback: `28-production-release-plan-2026-10.md` (§5 steps, §7 rollback, §12 results).

**Status of this document:** preparation only. CEO has approved preparation, not deployment. No production step is run until the CEO gives explicit written approval and the CTO confirms again.

## A. Before the window (evidence to show the CEO)

| # | Check | Evidence required | Status (2026-10-29) |
|---|---|---|---|
| A1 | Automated tests on the release commit | typecheck, lint, unit 730/730, build, integration 219/219, E2E on AI-off stack | Done (§12) |
| A2 | The two AI-off E2E failures understood | `01` fails at the "AI suggestion" step; `08` tests AI memory. New spec `01b` runs the same lifecycle with AI off (webhook → conversation → assignment → no draft, suggestion endpoint empty → operator reply → delivery → completed assignment → one usage record) | Passed 1/1 on AI-off stack, 2026-10-29. Specs `01` and `08` do not affect the release |
| A3 | Database rollback repeatable | second full rehearsal run, same result as the first corrected run | Done 2026-10-29 12:32 UTC: second isolated run identical to the first corrected run (16 → 29 → 16 migrations, restore exit 0 with 0 warnings, same row counts, 0 leftover tables, old web healthy before and after). Production untouched; rehearsal files, containers, network and image removed |
| A4 | Records in production are internal/test only | read-only list of users by role and email domain, tenant name, message count and length (no message text) | Done 2026-10-29 (read-only, no message text): 7 users = 5 `@demo.gco` seed users (hunter, CEO admin, manager, operator, client) plus 2 GCO-domain staff accounts (CEO admin, hunter); 1 tenant `[DEMO] Everline Retail Co`; 1 inbound message of 122 characters dated 2026-09-28 (demo seed). No real client data |
| A5 | Backblaze key restricted (`writeFiles` only, optional `listFiles`) and offsite restore shown | `b2-upload.py --check` clean; one nightly upload; offsite restore test | Open (account owner) |

## B. In the window (each step passes before the next)

| # | Step | Pass criterion |
|---|---|---|
| B1 | Fresh database dump | file present, size plausible, `pg_restore --list` readable, restored into a throwaway database with 16 migrations and the expected row counts |
| B2 | Code and image snapshot | current web/worker/realtime image tags saved under rollback names; copy of code folder and `.env` kept |
| B3 | Sync code, excluding `Caddyfile` and `.env*` | file list reviewed |
| B4 | Build; recreate web; `prisma migrate deploy`; recreate worker and realtime | 29 migrations applied, 0 failed |
| B5 | AI confirmed disabled | `AI_MASTER_SWITCH=disabled` in web, worker and realtime; health reports `ai: disabled` |
| B6 | Smoke test | sign-in; simulated message assigned to an operator; operator reply sent and delivered; tenant isolation (client cannot read another tenant); web, worker and realtime healthy; no error lines in logs |
| B7 | OpenAI usage | no calls after release time, compared with the CEO's 7-day baseline |

## C. Rollback triggers

Roll back immediately if B4, B5 or B6 fails, or if any critical service is unhealthy for more than 10 minutes. Code rollback: re-tag the saved images and recreate (additive migrations let old code run on the new schema, proven in the rehearsal). Database rollback only if the data is damaged: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, then plain `pg_restore` of the B1 dump (never `--clean --if-exists`). Report to the CEO in either case.

## D. Not exercised so far

Compose-level recreate and image re-tag on the live stack; old worker processing real jobs; sign-in on restored data; offsite restore from Backblaze.

## E. Recommendation

A2, A3 and A4 are complete. Open before go: A5 (Backblaze restricted key and offsite restore), the CEO's explicit written approval, and the OpenAI baseline. Final recommendation to follow once A5 is known. Not a deployment authorization.

## F. Preparation done on the server, 2026-10-29 (CEO approved preparation only; nothing deployed)
- **Fresh backup:** `gco-postgres-20261029T131056Z.dump`, 900,999 bytes, `pg_restore --list` readable (38 table-data entries). Restored into a throwaway database: exit 0, 0 warnings, 16 migrations, 7 users, 1 tenant, 1 message. Throwaway container removed. The nightly offsite upload to Backblaze is verified in the log every night from 24 Oct to 29 Oct; the manual run today reported "offsite upload failed" only because a manual run does not load the root-only credential file that the nightly timer uses (not a fault).
- **Rollback image tags:** `gco-web:pre-release-20261029` (25e6abd268c9), `gco-worker:pre-release-20261029` (7a02d5a80ff8), `gco-realtime:pre-release-20261029` (8c8a926bfc60). Services unchanged and healthy.
- **Code snapshot:** `/var/backups/gco-postgres/gco-code-pre-release-<timestamp>.tgz` (406 MB, mode 600, no secrets: only `.env.example` files; mostly a stray `.tools` folder). Stored in the backup folder because `/var/backups` itself is not writable by the `gco` user. The window repeats the backup immediately before the release.
- **Founder account (read-only):** `cristian@globalconversationoperations.com`, role CEO_ADMIN, active, password set, last sign-in 12 Oct 2026, two-factor off. The hunter account has never signed in.
