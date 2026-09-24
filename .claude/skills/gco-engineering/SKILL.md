---
name: gco-engineering
description: Default skill for implementing approved changes in the GCO application (app/, lib/, workers/, prisma/) within the existing architecture. Use for bug fixes, additive features, and named V1 hardening items. Owns the core-pipeline "do not touch without approval" boundary that other GCO skills reference.
---

# GCO Engineering

## Purpose

Implement approved changes to the GCO codebase (a Next.js 16 App Router app + a BullMQ worker process + a standalone WebSocket realtime process, on PostgreSQL/Prisma + Redis) without redesigning the parts of the system that are already working and verified. This is the **default** skill for "implement/fix/add X" requests in this repository.

GCO is currently **application-side pilot-ready, not fully production-validated**. Current HEAD at the time this skill was authored: `6ffc8d5`. Treat that as a baseline to diff against, not a fact to assume still holds — always check `git log -1`/`git status` at the start of a task.

## When to invoke automatically

- The user asks to implement, fix, extend, or refactor something under `app/`, `lib/`, `workers/`, or `prisma/`.
- Continuing a named MUST-HAVE or SHOULD-HAVE item from `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §24 or a deferred item from `docs/GCO_V1_HARDENING_REPORT.md` §20.
- A small, targeted hardening change in the same spirit as the Phase 1 hardening commit (`6ffc8d5`) — enforcing an existing-but-inert field, closing a gap in an existing mechanism, fixing a scoped RBAC/permission defect.

## When NOT to invoke

- Pure read-only inspection or audit requests → use `gco-testing`.
- A dedicated threat/security review of existing code → use `gco-security-review`.
- Anything touching `lib/integrations/**` or client adapter behavior → use `gco-integration`.
- Reviewing someone else's diff for correctness/style → use `gco-code-review`.
- Any request that amounts to redesigning the core pipeline (see boundary below) **without an explicit approval statement already given by the user in this conversation** — surface the boundary and ask, don't proceed.

## The core-pipeline boundary (canonical — other skills reference this section)

Per `docs/GCO_V1_HARDENING_REPORT.md` §22, the following were deliberately left untouched during the last hardening pass and must stay that way absent **explicit, specific approval** from the user for that exact area:

- `lib/queue/**` (queue definitions, retry/backoff policy, dead-letter handling)
- `workers/**` (BullMQ worker process, `workers/realtime-server.ts`)
- `lib/ai/**` (provider abstraction, mock/openai providers, context builder)
- `lib/assignment/**` (race-safe assignment engine and policy)
- `lib/messages/{ingest,send}.ts` (the core message lifecycle — `send.ts::operatorSendMessage` is structurally the *only* code path that creates an OUTBOUND message; see `docs/decisions.md` "AI never auto-sends")
- `lib/realtime/**` and the realtime ticket flow
- `lib/auth/tokens.ts` (auth token issuance)
- `lib/auth/rbac.ts` and `lib/auth/tenantGuard.ts` (the RBAC matrix and tenant-scope resolver — see `gco-security-review` for the full threat model these protect)
- SLA/timer logic (`Assignment.respondsBy`, `workers/processors/assignmentTimeout.ts`)

A request to change behavior here is not automatically refused — it may be exactly what's needed — but this skill must state plainly that the request touches the core-pipeline/RBAC/tenant-isolation boundary and get an explicit go-ahead before editing, rather than treating "the user asked for a feature" as implicit approval to redesign the mechanism underneath it.

## Required repository context

Read before starting:
- `AGENTS.md` / `CLAUDE.md`
- `package.json` (scripts — do not modify without explicit instruction)
- `prisma/schema.prisma` and the migrations under `prisma/migrations/`
- `lib/auth/rbac.ts`, `lib/auth/tenantGuard.ts`, `lib/tenant/activity.ts`
- `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §24 (MUST/SHOULD/DEFERRED)
- `docs/GCO_V1_HARDENING_REPORT.md` §22 (untouched-file list, reproduced above)
- `git log -1` and `git status` for the current, actual HEAD and working-tree state

## Procedure

1. Confirm current HEAD and working-tree state (`git status`) before making any change.
2. Identify whether the change stays inside the existing architecture or crosses the core-pipeline boundary above. If it crosses the boundary, stop and ask for explicit approval naming the specific file(s)/mechanism before editing.
3. Make the smallest change that satisfies the request. Do not add abstractions, config flags, or generalized frameworks for a one-off need (see `AGENTS.md`/root `CLAUDE.md` conventions already governing this repo).
4. Follow existing conventions: Zod validation on route bodies, `lib/api/response.ts`'s `ok`/`created`/`fail`/`handleRouteError` pattern, tenant-scoping via `resolveTenantScope`, permission checks via `assertCan`/`requirePermission`.
5. Delegate all test execution to **`gco-testing`** — do not invent ad hoc test commands. Run its canonical battery before and after the change.
6. After the change, diff against the core-pipeline boundary list to confirm nothing on it was touched without approval.

## Verification requirements

- Every implementation task must have a verification plan stated up front (what will be run, what result confirms success) — not just "should work."
- Every readiness or correctness claim must cite an actually-executed command from this session, via `gco-testing`. Never cite a prior document's test counts as current evidence.
- If the change touches `Tenant.status` or `Tenant.messageCap` (`lib/tenant/activity.ts`), re-state explicitly that `isMessageCapReached` is a **non-atomic, soft ceiling** (a `usageRecord.count()` check with no transactional slot reservation — see `docs/GCO_FINAL_V1_READINESS_AUDIT.md` §7/§20) unless this task's specific, approved scope was to make it atomic and that atomic behavior was freshly verified this session under concurrent load.

## Security constraints

- Never weaken `lib/auth/rbac.ts`'s permission matrix or `lib/auth/tenantGuard.ts`'s scope resolution without an explicit instruction naming that exact change.
- Never touch `.env` or print its contents; never introduce a new unauthenticated route.
- Operate only against the local dev stack (Postgres/Redis/`next dev`/worker/realtime server on localhost).
- Never commit or push. Only stage/commit if the user explicitly asks for it in this turn.

## Relationship to other GCO skills

- Test execution → delegate to `gco-testing` rather than restating commands here.
- Any change touching `lib/auth/*`, `middleware.ts`, `app/api/v1/**/route.ts` permission checks, or `lib/tenant/activity.ts` → hand off analysis to `gco-security-review` before/alongside implementation.
- Any change under `lib/integrations/**` → use `gco-integration` instead; it adds a client-spec gate this skill does not enforce.
- Once a change is made, a correctness/simplification pass belongs to `gco-code-review`.
- A full readiness statement after a batch of changes belongs to `gco-production-readiness`.

## Must never do

- Redesign the core pipeline (list above) without an explicit, specific approval statement in the conversation.
- Commit or push without being explicitly told to.
- Invent a client-specific requirement to justify a design choice — GCO currently has zero real client integrations (`dev-mock` only).
- Claim `messageCap` is atomic without having implemented and freshly verified an atomic version.
- Claim real AI provider behavior — `AI_PROVIDER` is `mock` by default and `OPENAI_API_KEY` is empty in this environment; do not describe OpenAI-provider behavior as observed.
- Treat a schema-only table (`OperatorMetricSnapshot`, `Notification`) or an unwritten field (`AiMemory.correctedValue`/`isDeleted`) as implemented functionality just because it exists in `prisma/schema.prisma`.
- Mark something "tested" or "verified" without an actual command execution in this session.
