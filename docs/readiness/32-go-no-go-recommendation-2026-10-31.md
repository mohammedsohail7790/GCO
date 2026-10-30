# 32 — Go/no-go recommendation, production release window Saturday 31 Oct 2026 07:00–09:00 (Italy)

**From:** CTO. **To:** CEO. **Written:** Friday 30 Oct 2026. **Status:** a recommendation only. It is **not** a deployment authorisation. Nothing is deployed until the CEO gives explicit written approval and the CTO confirms again. Fallback window: Sunday 1 Nov, same hours. Companion: `29-go-no-go-checklist-2026-10-31.md`, plan `28-production-release-plan-2026-10.md`.

## 1. Recommendation

**CONDITIONAL GO for Saturday 07:00–09:00**, provided all five conditions in section 3 are met. If any is not met, **postpone to Sunday** (CEO's own rule: postpone rather than rush). The release is additive and has been rehearsed twice with identical results, so the technical risk is low; the main risks are timing and human availability, not the code.

## 2. Evidence (all gathered this week; AI disabled throughout)

| Question | Result |
|---|---|
| Is the release code the code we tested? | Release commit `ec59f38`. Every later commit changes only `docs/` and `tests/` (checked: `git diff ec59f38..HEAD` touches nothing else), so the application code is identical. |
| Automated tests | typecheck and lint clean; unit 730/730; production build OK; integration 219/219; end-to-end 297 passed, 2 skipped, 2 failed. The two failures are specs `01` and `08`, which need AI; a new AI-off spec `01b` covers the same lifecycle and passed. |
| Fresh backup verified? | 29 Oct 13:10 UTC dump (900,999 bytes): readable, restored into a throwaway database with 16 migrations, 7 users, 1 tenant, 1 message, 0 warnings. A new dump is taken at the start of the window and checked the same way. |
| Nightly offsite backup | Backblaze upload verified in the log every night 24–29 Oct. |
| Code and images preserved? | Rollback tags `pre-release-20261029` on web (`25e6abd268c9`), worker (`7a02d5a80ff8`), realtime (`8c8a926bfc60`); code snapshot (406 MB, no secrets) saved. |
| Migration safety | 13 additive migrations (16 → 29), 0 failed in two rehearsals; the old code runs healthy on the new schema (web healthy, worker 0 errors), so a code rollback needs no database rollback. |
| Database rollback repeatable? | Two isolated runs, identical: drop and recreate the schema, then plain `pg_restore`; exit 0, 0 warnings, 16 migrations, same counts, no leftover tables, old web healthy. (An earlier attempt with `--clean` failed; the procedure was corrected and documented.) |
| Production data | 7 users (5 demo, 2 staff), 1 demo tenant, 1 demo message; no real client data. |
| AI | Master switch pinned to disabled in web, worker and realtime; health must report `ai: disabled`; tested. |
| Smoke and rollback criteria | Defined in the checklist: sign-in, simulated message assigned, operator reply delivered, tenant isolation, web/worker/realtime health, AI disabled, no log errors, no OpenAI calls. |
| Founder access | Account active; password reset on 29 Oct; the CEO has since reported that he accessed the Founder dashboard. |

## 3. Conditions for GO (all required)
1. **CEO written approval** received before 07:00 Italian time, naming the window.
2. **CEO can log in as Founder** (he reported success after the reset) and, ideally, has enrolled two-factor.
3. **CTO available for the whole window** and one hour after, with the server access key and the checklist open.
4. **Window-start checks pass:** the new backup restores cleanly into the throwaway database; rollback tags and code snapshot confirmed; `docker compose ps` all healthy; disk space adequate.
5. **No new application commit** is added after `ec59f38` apart from documents and tests. Any change to application code resets this recommendation.

## 4. What is not proven (and how we handle it)
- **Live-stack recreate and image re-tag** cannot be isolated; they are standard compose commands, executed step by step with the old tags ready, and the first sign of trouble triggers rollback.
- **The old worker handling real jobs** and **sign-in on restored data** were not exercised; the smoke test covers sign-in and a simulated message on the live stack after the release.
- **Offsite (Backblaze) restore** has not been done; the CEO's key and a restore test are still open. This does **not** block the release (the local backup and tested restore protect the window) but **real client data must not be loaded until it is done.**
- **Timing:** the isolated rehearsal ran in about two minutes (including a build). The live window has ample margin (two hours).

## 5. Rollback triggers (unchanged)
Roll back immediately if migrations fail, AI is not reported disabled, the smoke test fails, or a critical service is unhealthy for more than 10 minutes. Code rollback: re-tag the saved images and recreate. Database rollback only if data is damaged: drop and recreate the schema, plain restore of the window-start dump (never `--clean --if-exists`). Report to the CEO either way.

## 6. Open items that do **not** block the release but must be closed before real client data
1. Backblaze restricted key, 30-day lifecycle rule, offsite restore proven (CEO/account owner).
2. Two-factor required for Founder and CTO; production demo accounts switched off (needs CEO approval after his login works).
3. OpenAI key removal after the release is stable (CEO agreed in principle; needs written approval); the 7-day usage baseline from the CEO, then post-release zero-usage check.
4. DKIM confirmation (CEO).
5. P0 roadmap items (`30`/`31`): contract and milestone tracking, exports and invoice PDF, integration health, load test, monitoring.

## 7. Decision requested
Please reply in writing: **"Approved for Saturday 31 October, 07:00–09:00 Italian time"**, or **"Postpone to Sunday 1 November"**, or ask for further evidence. The CTO then confirms and starts only on that message.
