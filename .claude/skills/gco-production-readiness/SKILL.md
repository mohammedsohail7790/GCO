---
name: gco-production-readiness
description: Produces or refreshes a read-only, evidence-only GCO readiness assessment (VERIFIED/PARTIAL/MISSING/BLOCKED/NOT VERIFIED) using fresh evidence gathered this session only. Use for "are we production ready," "is this pilot-ready," or "what's blocked" questions. Never fixes what it finds.
---

# GCO Production Readiness

## Purpose

Own the full readiness-assessment process for GCO — the same discipline already established in `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md`, `docs/GCO_V1_HARDENING_REPORT.md`, and `docs/GCO_FINAL_V1_READINESS_AUDIT.md`: every claim backed by evidence gathered **in the current session**, using the exact status vocabulary **VERIFIED / PARTIAL / MISSING / BLOCKED / NOT VERIFIED**, with prior documents used only as a comparison baseline, never as a substitute for re-checking.

GCO's standing position, established by the last full readiness audit against commit `6ffc8d5`: **the application foundation is hardened and pilot-ready from the application side; production validation (real client integration, real AI credentials, production infrastructure/deployment) remains deferred to external dependencies.** Treat this as the prior finding to re-verify, not as a fact to restate without checking.

## When to invoke automatically

- The user asks "are we production ready," "is this pilot-ready," "what's blocked," or asks for an updated audit/readiness report.
- Before any readiness statement that would reach a stakeholder or a prospective client.

## When NOT to invoke

- During implementation work — that's `gco-engineering`. This skill never fixes what it finds; it only reports, exactly like the inspection-only methodology already established in the existing audit docs.
- As a substitute for `gco-security-review`'s process — this skill's security row cites that skill's findings as input rather than re-deriving them from scratch.

## Required repository context

- All existing GCO docs as prior baselines for comparison (`docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md`, `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md`, `docs/GCO_V1_HARDENING_REPORT.md`, `docs/GCO_CLIENT_TECHNICAL_QUESTIONNAIRE.md`, `docs/GCO_FINAL_V1_READINESS_AUDIT.md`, `docs/GCO_PUBLIC_WEBSITE_ROADMAP.md`) — read for context, never quoted as current fact without re-checking.
- `git log`, `git status`, current HEAD.
- `package.json` scripts, `prisma/schema.prisma`.
- `.env` — check **existence and emptiness** of `AI_PROVIDER`, `OPENAI_API_KEY`, `SENTRY_DSN` only; never read or echo their actual values if populated.
- `.github/workflows/ci.yml` (presence) vs. any actual evidence a workflow has executed on GitHub's infrastructure.
- `Dockerfile` / `docker-compose.yml` (presence) vs. actual `docker` binary availability and actual build/run evidence.

## Required fresh-evidence checklist

Every readiness assessment must gather ALL of the following, fresh, this session — no item may be answered from a prior document:

1. **Full test battery** — delegate to `gco-testing`: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npx playwright test`, `npm run build`. Report exact counts and any flakiness exactly as observed (per `gco-testing`'s honest-reporting rule).
2. **`npx prisma migrate status`** — confirm migrations are actually applied cleanly.
3. **`npm audit --omit=dev`** — production dependency vulnerability count.
4. **Docker availability** — `command -v docker` (or equivalent). If absent, state plainly that containerized deployment is **NOT VERIFIED / BLOCKED**, not "should work."
5. **CI workflow presence vs. execution evidence** — `.github/workflows/ci.yml` existing is not evidence it has run; check for actual run history if accessible, otherwise report as **NOT VERIFIED**.
6. **Schema-only functionality check** — grep for actual read/write usage before calling any of these "implemented": `Tenant.status` (should now be read by `lib/tenant/activity.ts`, `app/api/v1/webhooks/[integrationId]/route.ts`, `auth/login`, and `lib/messages/ingest.ts` as of the Phase 1 hardening — confirm this is still true), `Tenant.messageCap`, `OperatorMetricSnapshot`, `Notification`, `AiMemory.correctedValue`/`isDeleted`, `Note` creation. A model existing in `prisma/schema.prisma` is not evidence of a working feature.
7. **`.env` credential-state check** — confirm whether `OPENAI_API_KEY` and `SENTRY_DSN` are empty or populated, without ever printing the value; this determines whether AI-provider and error-tracking claims may even be attempted.

## Report structure

Mirror the existing audits' shape: project inventory → architecture → feature-by-feature status → database audit → API audit → security threat review → failure/resilience audit → production readiness scorecard → risks → final executive summary. Use the same five-value status vocabulary throughout. State the commit under audit explicitly.

## Security constraints

- Read-only by default. No code, schema, migration, test, or documentation edit as a side effect of running an assessment.
- Writing a **new** report file into `docs/` is a distinct, confirmable action — ask before creating it; do not treat "run an audit" as implicit permission to also write a new doc, unless the user's request already asked for a written report.
- Never echo `.env` values.
- Never commit or push the resulting document without explicit instruction.

## Relationship to other GCO skills

- Test evidence → delegate entirely to `gco-testing`; do not maintain a separate command list here.
- Security scorecard row → cite `gco-security-review`'s findings as input; do not re-run an independent security process.
- If gaps are found that need fixing → hand off to `gco-engineering` (or `gco-integration` for adapter-boundary gaps) as a separate, later task — this skill does not fix anything itself.

## Must never do

- Claim Docker, CI, or production infrastructure is verified without actual execution evidence gathered in this session.
- Claim real AI provider validation while `OPENAI_API_KEY` is empty — state plainly that AI is verified for the mock provider only.
- Claim real client integration exists without an actual, named client API specification and sandbox in hand (see `gco-integration` for the gate this depends on).
- Treat a schema-only table or an unwritten field as implemented functionality.
- Reuse a stale test count from a prior document instead of re-running the suite this session.
- Claim `messageCap` is a hard/atomic cap — it is a documented soft ceiling until an atomic implementation is built and verified.
- Commit or push the resulting report without explicit instruction.
