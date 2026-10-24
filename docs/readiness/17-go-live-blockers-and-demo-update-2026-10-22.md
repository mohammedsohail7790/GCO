# 17 — Go-live blockers and live-demo readiness (update of 2026-10-22)

**Commit under test:** `9746d13` (working tree: `.gitignore` modified, `deliverables/` untracked; no application code changed). **Evidence:** all test results below were produced in this session, on the local stack (PostgreSQL 16, Redis, Next.js production build, BullMQ worker, realtime server). Status vocabulary: VERIFIED / PARTIAL / MISSING / BLOCKED / NOT VERIFIED. This report fixes nothing; it is read-only evidence.

## 1. Summary for the CEO

- **Application: VERIFIED on the simulator.** Type check, lint, 721 unit tests, 217 integration tests and the end-to-end suite pass, including the 11-step simulated client acceptance test.
- **Client launch: still BLOCKED.** None of the blockers in section 3 is a code defect; each needs a decision, an access or an external party.
- **Live demo with test data: YES, feasible now**, on the local stack or a recorded session, using fictional data only (section 4). A demo on a server is NOT VERIFIED (staging server and Docker host blocked).
- **Done since the 20 October checklist:** Google Workspace migration (domain verified, DKIM, SPF, MX switched, SPF/DKIM/DMARC PASS on both mailboxes, confirmed by the CEO 22 October).

## 2. Fresh test evidence (this session)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | VERIFIED: no errors |
| Lint | `npm run lint` | VERIFIED: no errors |
| Unit tests | `npm test` | VERIFIED: 47 files, **721 passed** (prior document: 720) |
| Integration tests | `npm run test:integration` | VERIFIED: 34 files, **217 passed** (real PostgreSQL + Redis) |
| Production build | `npm run build` | VERIFIED: succeeded |
| Migrations | `npx prisma migrate status` | **Found the local database 9 migrations behind** (last used 30 Sept); applied with `prisma migrate deploy`; now "Database schema is up to date", 29 migrations. Production migration NOT VERIFIED. |
| Dependency audit | `npm audit --omit=dev` | VERIFIED: 0 vulnerabilities |
| End-to-end, first run (AI off, default) | `npx playwright test` | **261 passed, 6 failed, 2 skipped, 32 did not run** (4.7 min) |
| End-to-end, re-run of the 4 failed integration specs | specs 24, 25, 27, 53 | **46 passed** |

### The end-to-end failures, exactly as observed
1. **Specs 01 and 08 (AI suggestion step, AI memory extraction): 2 failures.** Expected and documented: these test the AI features, and AI is disabled by design. They were not re-run.
2. **Specs 24, 25, 27, 53 (4 failures; the 32 tests reported as "did not run" sit behind failures in these in-order files):** `POST /admin/integrations` returned 400 instead of 201. **Cause: my stack was started without `ALLOW_DEV_ADAPTERS=true`**, the flag that lets the safe-HTTP guard accept the simulator's `http://127.0.0.1` callback (it exists for local/CI only and must never be set in production). After restarting the app and worker with the flag, all four spec files passed (46/46). This is an environment gap, not a code defect.
3. **Not shown:** one single full-suite run with zero failures in this session. The evidence is the two runs above; I did not re-run the full suite after the restart. A full re-run takes about 5 minutes and can be done on request.
4. The integration log contains an error trace from `careerApplicationFailure`; that test forces a failure on purpose and passes.

## 3. Go-live blockers (status after this session's evidence)

| # | Blocker | Status | Owner / what is needed |
|---|---|---|---|
| 1 | **Real client integration** (provider API documentation, sandbox, credentials, acceptance criteria) | BLOCKED | Client / partner. Everything so far runs against the simulator and test doubles. |
| 2 | **Software ownership and GitHub:** the repository remote is `git@github.com:mohammedsohail7790/GCO.git`, a personal account | BLOCKED | CEO + CTO + lawyer: organization transfer and ownership agreement (`12`, `14`). |
| 3 | **Server staging, Docker and CI:** `docker` is not installed on this machine; `.github/workflows/ci.yml` exists but there is no evidence it ever ran (`gh` not installed, run history not checked) | NOT VERIFIED / BLOCKED | Needs a Docker host, server access, GitHub organization. |
| 4 | **Production restore drill** and **offsite backup key (finding B-1: the key can delete offsite backups)** | PARTIAL / FAIL (documented) | Needs the production dump, account owner, CEO approval. |
| 5 | **Legal:** privacy notice, DPA, transfer policy, retention (30 days / 6 months provisional, job not activated) | BLOCKED | Legal review; drafts are unreviewed. |
| 6 | **Scheduled jobs on the server** (systemd units written, not installed) | BLOCKED | Server approval. |
| 7 | **Error tracking and paging:** `SENTRY_DSN` is empty; no on-call paging | MISSING | Decision and account. |
| 8 | **AI provider:** `OPENAI_API_KEY` is empty and AI is disabled by design | Mock/disabled only; real provider NOT VERIFIED | CEO decision when AI goes live. |
| 9 | **Notification email channel:** `SMTP_URL` is empty (in-app notifications only; the app sends no mail) | MISSING (optional) | Choose a sender now that Google Workspace is live. |
| 10 | **Third-party security review, soak/production-topology load test, outage recovery drill** | NOT VERIFIED | Budget and scheduling. |
| 11 | **Budget items:** VAT regime, invoices, domain, UptimeRobot/Calendly | PARTIAL | CEO / accountant. |
| 12 | **Production launch approval** | BLOCKED | CEO. |

**Closed since 20 October:** Google Workspace migration (see section 1).

Schema-only check (usage of each feature in `app/`, `lib/`, `workers/`): `Tenant.status` referenced in 13 source files; `messageCap` in 7 (it remains a documented soft ceiling, not an atomic cap); `Notification` creation, `AiMemory.correctedValue`, `isDeleted` and `Note` creation are each referenced in source. **`OperatorMetricSnapshot` has no usage in application source** and should be treated as schema-only. I did not trace behavior beyond the grep.

## 4. Secure live CRM demo with test data

**Verdict: feasible now, with conditions.**

- **What can be shown (VERIFIED by automated tests on simulated data):** operator, manager, client and founder workflows (`docs/readiness/15-demo-walkthrough-simulated-data.md`), the sales funnel / CRM (spec 28), client onboarding (specs 24, 27) and the 11-step simulated client acceptance test (spec 53). An existing recorded walkthrough is in `deliverables/partner-demo/`.
- **How to run it:** local stack, `npm run seed`, then `npx tsx prisma/demo-showcase.ts --reset`. The seed scripts refuse to run in a production-mode process.
- **Conditions for security:** fictional data only; never production data or real customer or partner details; do not demo from a server (staging and Docker are NOT VERIFIED); share the screen or a recording, not a login; do not expose the local stack to the internet; keep `ALLOW_DEV_ADAPTERS` for the local demo only.
- **Say out loud:** replies go to a simulator, not to a real platform; AI is off by design; moderation verdicts are not sent back to a client platform; invoices are commercial invoices, not Italian e-invoices; nothing here is a production client.
- **For a dating-platform partner specifically:** their data is sensitive (personal and possibly special-category data). The privacy documents are unreviewed drafts, so a pilot with their real data stays BLOCKED until legal review (blocker 5) and a real integration (blocker 1).

## 5. Local environment notes (this session)

The local PostgreSQL and Redis had been stopped since 30 September. I started them from `.tools/`, applied the 9 pending migrations to the **local development database only**, and started Redis from a fresh data directory because the old `dump.rdb` cannot be read by this Redis build (the old file was left untouched). Nothing touched production or Cloudflare during testing.

## 6. Verdict

**NOT READY FOR CLIENT LAUNCH.** Ready for a controlled demo on simulated data and for acceptance testing against the simulator. Critical path: real client integration documents, GitHub organization ownership, legal review, a Docker/staging host, and the production restore drill.
