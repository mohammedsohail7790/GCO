# 48 — Deployment plan (draft, NOT approved, NOT executed) and what still blocks the first real client (4 Nov 2026)

**Authority and limits.** The CEO asked for a plan on 4 Nov. **Nothing here may be run without his separate written approval.** This document refreshes `28` (plan), `32` (go/no-go) and `33` (runbook), which were written for release candidate `ec59f38` and are **out of date** for the current branch.

## 1. Server read-only check (CEO-approved, 3 Nov 2026 21:08 UTC, one SSH session, nothing changed)
Read only: git, container status, image tags, a migration **count**, the timer list, backup file names and sizes, `age` presence, free disk. No file contents, secrets or customer data were read; nothing was written.
| Fact | Result |
|---|---|
| Deployed code | `d9af8dc` (12 Oct 2026) with **24 uncommitted changed files** in the server tree (the 2FA and account work deployed from a workstation) |
| Database migrations | **16 applied, 0 failed** (latest `20261012065733_two_factor`) |
| Services | postgres, redis, realtime up and healthy 5 weeks; web healthy 3 weeks; worker up 3 weeks |
| Rollback images | `gco-web`, `gco-worker` tagged `pre-release-20261029` still present (plus older `pre-2fa`, `pre-inside`, `pre-onboarding` tags) |
| Backups | nightly timer active; newest dump 3 Nov 03:31 UTC (902,572 bytes), 1 and 2 Nov present; local backup folder about 400 MB |
| Encryption and alerts | `age` **not installed**; recipients file **absent** (backups are plain); **no watchdog units** installed |
| Disk | 58 GB free of 150 GB |
| AI switch in containers | **Not read** (my command printed a warning instead of the value). The deployed version predates the master switch, so it is expected to be absent |
| Offsite upload | **Not checked** in this session |
This agrees with the route comparison (`46`): production is still the 12 Oct version.

## 2. What the release would contain
**Size:** 67 commits, 444 files, about 19,500 added lines since `d9af8dc`. **Database:** **14 new additive migrations, 16 → 30**: tenant services/industry, operator earnings ledger, supervisor/CTO roles and teams, weekly reports, shifts/absences/handovers, training/qualifications, knowledge entries, billing/invoices, tenant AI mode, privacy retention requests, moderation, client requests and alert routes, alert route email, and (new since `32`) **integration environment and stored check history**. I scanned the earlier 13 for `DROP`/`DELETE`/`TRUNCATE`/type changes/non-defaulted NOT NULL in October; the 14th is an added column with a default and a new table. **Re-scan the whole set on the frozen commit before any rehearsal.**
**Features that go live with it (currently BUILT):** shifts, absences, handovers, transfer; knowledge, training, moderation; client requests, client invoices; billing back office; operator earnings; privacy tools; executive overview; **per-reply delivery status; client-portal leak tests (tests only); integration sandbox/production control and check history; CSV exports**; AI master switch pinned to disabled in compose (the worker stops all AI calls: confirm with the CEO, as in `28` §3).
**Not part of the release (each a separate approval):** the alert watchdog and its systemd units, the Workspace relay, `age` installation and the encryption recipients file, the Caddy file, DNS/Cloudflare, `.env` and `.env.ai`, the OpenAI key removal, two-factor enforcement, switching demo accounts off.

## 3. Why the earlier rehearsals no longer count
The October rehearsals (16 → 29 migrations, two rollback rehearsals) were run on `ec59f38`. The branch now adds a 30th migration and application code (delivery status, integration control, exports). **The approval condition in `32` §3.5 ("no new application commit after `ec59f38`") no longer holds.** All gates must be re-run on the new frozen commit.

## 4. Plan
**Step 0: freeze.** Choose the release commit on `p0/first-client-readiness` (currently `88a10da`; re-chosen when the P0 list is done), tag it; nothing but documents after that. Deploy from a clean `git archive` of the tag, never from the workstation tree. The server tree's 24 uncommitted files are already part of the new commit history, so the sync should show them as identical or newer; any server-only file found is reviewed before it is overwritten.
**Gates (all must pass; same names as `28`):**
| Gate | What | When |
|---|---|---|
| G1 | typecheck, lint, unit, integration, **full** E2E on the AI-off stack, production build, on the exact tag; the known AI-only failures (specs `01`, `08`) explained; **E2E `46` seeding flake investigated and fixed** (not yet done) | before the window |
| G2 | clean, pushed tag | before the window |
| G3 | rehearsal on the server in a throwaway directory and network: restore the newest production dump, `prisma migrate deploy` from the new image (**expect 16 → 30, 0 failed**), `restore-verify.sql`, health with AI disabled | repeat on the new tag |
| G4 | rollback rehearsal: old images against the new schema; database rollback by dropping the schema then plain `pg_restore` (never `--clean`) | repeat on the new tag |
| G5 | encryption, upload and offsite restore proven **on staging** (the CEO's requirement) | before any production change to backups |
| G6 | CEO's written approval naming the window; go/no-go refreshed (`32` redone) | before the window |
**Window:** the earliest realistic window is **Sat 28 or Sun 29 Nov**, only if the P0 builds and gates are done (`41`); an estimate, not a promise. Expected downtime 2 to 5 minutes.
**Execution (runbook `33`, updated):** (1) fresh backup, check size and `pg_restore --list`; (2) refresh the rollback tags (`pre-release-<date>`) and a code snapshot without secrets; (3) sync the release excluding `.env*`, `Caddyfile`, `node_modules`, `.next`, `.git`, dry-run first and compare with the plan; (4) build web, worker, realtime while the old ones run; (5) recreate web, **`prisma migrate deploy`: expect 30 finished, 0 failed**, then recreate worker and realtime; (6) verify: all five services healthy, health reports **AI disabled**, `AI_MASTER_SWITCH` is `disabled` in web, worker and realtime, sign-in as the Founder, an operator and a client, a simulated message assigned and a reply shown as delivered, tenant separation, no draft shown on an old conversation, security headers present, 10 minutes of clean logs, nightly backup timer still active; (7) 24-hour watch (next backup succeeds, no AI calls).
**Rollback triggers:** failed migration, AI not reported disabled, failed smoke test, a critical service unhealthy for more than 10 minutes. **Code rollback** (about 3 minutes): re-tag the saved images and recreate; additive migrations let the old code run on the new schema. **Database rollback** only if data is damaged: stop services, drop and recreate the schema, plain restore of the step-1 dump. Not reversible: emails sent and users created through new flows; the release switches none on.
**After the release, each its own approval:** (a) create the CTO account, enrol the Founder and CTO in two-step sign-in, then enforce it; (b) switch demo accounts off with the supplied tool (dry run on staging first; check a real replacement Founder account exists); (c) install the watchdog and relay; (d) install `age` then the recipients file, and prove an encrypted offsite restore; (e) remove the OpenAI key; (f) publish security-page wording only after each statement is checked against the live configuration.

## 5. What still prevents safely onboarding the first real client
Status: **Done**, **In progress**, **Blocked** (waiting on a person or approval), **Open** (not started).
| # | Blocker | Status | Who / what is needed |
|---|---|---|---|
| 1 | The release is not deployed (production is the 12 Oct version; shifts, training, billing, delivery status, exports, integration control are not live) | Open | CEO's written approval after G1 to G6; window |
| 2 | Backups are plain and the Backblaze key can delete: no restricted key, no encryption, no 30-day rule, **no offsite restore ever proven** | Blocked | CEO creates the keys with me (`38`); `age` installed on the server; staging restore first |
| 3 | No failure or outage alert reaches a person (watchdog built, not installed; relay not configured; no external monitor) | In progress | CEO approves the Workspace relay and creates the UptimeRobot account |
| 4 | Two-step sign-in not enforced for Founder and CTO; no CTO account in production | Open | After the release; CEO enrols first |
| 5 | Five demo accounts still active on production | Open | After 4; separate approval |
| 6 | Production-like load test at pilot size not done (only a development-laptop run) | Blocked | CEO's final approval for the temporary server (about €2.77 to €3.30; exact figure from the Hetzner console first); operator-session test script still to write |
| 7 | **Legal:** DPA, pilot agreement, privacy notice, transfer assessment for access from India, partner terms are drafts awaiting a lawyer | Blocked | CEO's lawyer |
| 8 | **Access from India** to real client data is a policy, not a technical control (the server and backups are readable by whoever holds root or the storage key) | Open | Encrypted backups with CEO-held keys; break-glass access with an EU approver; legal review |
| 9 | Billing and invoicing: tax code, registered address, e-invoicing route and VAT treatment missing; the internal invoice page is not a tax invoice | Blocked | CEO and accountant |
| 10 | The first client's integration: no real client system is connected; needs the client's API documentation and sandbox, a feasibility note, then promotion to Production with verification | Blocked | The client; CTO |
| 11 | Independent security test: requests approved to be sent (nothing bought); the CEO's rule allows a limited pilot before it only if essential controls, legal review and client requirements are met | In progress | Quotes from three firms; CEO decision |
| 12 | The security page and partner pack must be checked against **live** configuration before publication | Open | After the release; CEO's written approval |
| 13 | Staffing and quality: 2 to 5 trained operators, a supervisor, shift plan, handling-time baseline, pilot cost inputs and the pricing model | Open | CEO (hours, pay basis, price); training in the platform |
| 14 | Release-gate quality: E2E `46` seeding flake and one unexplained integration failure not investigated; two AI-only E2E specs fail with AI off | Open | CTO, before G1 |
| 15 | OpenAI key still present on the server | Open | CEO's approval after release |
| 16 | Remaining P0 builds: operator-session load-test script, staging rehearsal of the 2FA reset tool, per-client integration health page (later list) | In progress | CTO |
**Done and evidence-backed (not blockers):** isolation and permission tests, AI off and pinned, signed webhook both ways against a simulator, CSV export service, delivery status, integration environment control, nightly backup with a proven local restore and two rollback rehearsals on the old commit, restore and rollback procedure written.
**Critical path (estimates; several parts are set by others):** technical gates about 3 to 4 weeks of work; legal, the first client's sandbox and the keys are outside my control. A first pilot in the **first week of December** remains realistic; **the last week of November is possible only if every item above lands on time**. No date is promised.

## 6. Gate results on commit `8179167` (local, 4 Nov 2026; AI-off stack for E2E)
| Gate | Result |
|---|---|
| G1 typecheck, lint | clean |
| G1 unit | **744 of 744** |
| G1 integration (real PostgreSQL and Redis) | **229 of 229 in each of 3 consecutive full runs** |
| G1 production build | OK |
| G1 end-to-end, full suite | **307 passed, 2 skipped, 2 failed**: only spec `01` (AI suggestion step) and `08` (AI memory), which test AI features and fail with AI off by design (spec `01b` covers the AI-off lifecycle and passed). Spec `46` passed. |
| G3 migration rehearsal, local | A throwaway database was built with **production's exact schema state** (the 15 migrations in `d9af8dc` plus `two_factor` = 16, matching the server's 16 applied) and filled with sample rows (1 tenant, 5 users, 1 conversation, 1 message). `prisma migrate deploy` applied the **14 new migrations: 16 → 30, 0 failed**; row counts unchanged; **no drift** against `schema.prisma`; the 14 integrity checks in `scripts/restore-verify.sql` all 0. A scan of the 14 new migrations found **no** `DROP`, `DELETE`, `TRUNCATE`, type change, rename, `SET NOT NULL`, or `NOT NULL` column without a default. |
| G4 database rollback, local | Dropped the schema and restored the pre-release dump with plain `pg_restore` (no `--clean`): exit 0, 16 migrations, same counts, no new-schema tables left. |
**Not covered, still to do:** the rehearsal **on the server** with a copy of the real production dump and the real Docker images (the local run uses a synthetic dataset, so data-dependent surprises are not excluded); the live Docker recreate and image re-tag; the code-rollback test of the old images against the new schema for the **14th** migration (the first 13 were tested on the server in October; the 14th is an added column with a default and a new table, so old code is expected to ignore it, but this was not run); the encrypted-backup restore on staging (needs `age`; it was shown locally on 23 Oct, `25`, and not repeated today); sign-in on restored data.
**Test-run notes (honest):** my first end-to-end run in the same script produced 160 failures because the web server on port 3100 stopped answering partway (connection refused); that run is discarded and the cause was not identified (the server log shows no error; leftover test processes were found on other ports). The re-run, with a watcher on the server, saw no downtime. **The earlier `46` seeding failure and the one unexplained integration failure did not recur in 3 integration runs and 2 clean end-to-end runs; their cause is still unproven.** The most likely cause for `46` is that the seeding helper's wait on the write limit (16 seconds, up to 4 times) can exceed the 30-second test limit when the shared admin session hits the limit mid-suite; I have not changed it, because a fix without a reproduction would be a guess.
