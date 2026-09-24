---
name: gco-security-review
description: Security/threat review of GCO code against the repository's actual known threat surface — auth/session, RBAC, tenant isolation, WebSocket isolation, webhook HMAC verification, rate limiting, and the messageCap race. Read-only by default. Use for any change touching lib/auth/*, middleware.ts, permission checks, or rate limiting.
---

# GCO Security Review

## Purpose

Perform an evidence-based security review of GCO code — existing or a proposed diff — against the **specific threat classes this codebase actually has surface for**, verified by re-running the tests that attack them. This skill owns GCO's threat model; it does not speculate about generic web-app vulnerability classes the codebase has no surface for (there is no file upload, no raw SQL string-building, no CORS configuration of consequence, no third-party auth provider).

## Known GCO threat surface (canonical — do not expand without a demonstrated new attack surface in the code)

1. **Authentication / session security** — custom HS256 JWT (`lib/auth/tokens.ts`), `Session` refresh-token rows, login rate limiting, logout revocation, two distinct token types (`access` vs. 30-second `realtime` tickets) that must remain mutually exclusive.
2. **RBAC** — the permission matrix in `lib/auth/rbac.ts` (`PERMISSIONS`, `can`, `assertCan`) and every route's `requirePermission`/`assertCan` call site. Five roles: `CEO_ADMIN`, `MANAGER`, `OPERATOR`, `CLIENT`, `ASSISTANT`.
3. **Tenant isolation** — `lib/auth/tenantGuard.ts::resolveTenantScope`. `CLIENT` is always pinned to `session.tenantId` regardless of any request-supplied value; `MANAGER`/`OPERATOR` cannot cross into another tenant even if one is supplied; `CEO_ADMIN`/`ASSISTANT` are global and may target any tenant explicitly.
4. **WebSocket isolation** — `workers/realtime-server.ts`, realtime ticket issuance/verification, per-tenant Redis pub/sub channel scoping.
5. **Webhook HMAC verification** — `lib/integrations/adapters/devMock.ts::verifyWebhookSignature` (HMAC-SHA256, timing-safe compare via `crypto.timingSafeEqual`), and the webhook route's processing order (rate-limit → find integration → tenant-status → message-cap → read body → verify signature → parse JSON → dedup → enqueue).
6. **Rate limiting** — `lib/api/rateLimit.ts::isRateLimited` (Redis fixed-window) and the `RATE_LIMITS` table (`WEBHOOK` 3000/min, `AUTHENTICATED_WRITE` 120/min, `LOGIN` 10/15min). Coverage is per-route and was extended in the Phase 1 hardening pass — confirm current coverage by grep, don't assume it's still exactly what a prior doc says.
7. **`messageCap` race** — `lib/tenant/activity.ts::isMessageCapReached` counts `usageRecord.count()` at request time with **no atomic slot reservation**, while usage is recorded asynchronously by the worker. This is a documented, reported, **unfixed** TOCTOU race: a small number of in-flight concurrent messages near the cap can overshoot it. It is a **soft ceiling, not a hard atomic one** (`docs/GCO_FINAL_V1_READINESS_AUDIT.md` §7/§20).

Also relevant, already-known and accepted as a deliberate tradeoff, **not a finding to re-raise as new**: tenant isolation is entirely application-layer — there is no PostgreSQL row-level security. Do not report this as a novel discovery; it is documented in `docs/decisions.md`-adjacent audit material and is a known, accepted single point of failure, not an oversight.

## When to invoke automatically

- A diff touches `lib/auth/*`, `middleware.ts`, any `app/api/v1/**/route.ts` permission or tenant-scope check, `lib/tenant/activity.ts`, `lib/api/rateLimit.ts`, `workers/realtime-server.ts`, or `lib/realtime/**`.
- The user asks "is this safe," "security review," or requests a change to a permission check, tenant-scope resolution, or webhook verification.
- Proactively, before any change that could alter who can access what data or actions.

## When NOT to invoke

- Pure UI/styling changes with no data-access implication.
- To produce compliance claims (SOC2, ISO, GDPR-as-a-processor, encryption-at-rest specifics, uptime SLAs) — these are **out of scope entirely**, not merely deferred. GCO has made no such claims and this skill must not manufacture them (see `docs/GCO_PUBLIC_WEBSITE_ROADMAP.md` §10's claim-classification table for the same discipline applied to marketing copy — the same rule applies to internal review language).
- To expand the threat checklist above into generic, speculative categories (SSRF, deserialization, etc.) unless the actual repository has gained a concrete attack surface for them — grep for it first; don't pad findings.

## Required repository context

- `lib/auth/rbac.ts`, `lib/auth/tenantGuard.ts`, `lib/auth/tokens.ts`, `middleware.ts`
- `lib/tenant/activity.ts`, `lib/api/rateLimit.ts`
- `lib/integrations/adapters/devMock.ts` (the only webhook signature implementation that exists)
- `tests/e2e/05-tenant-isolation.spec.ts`, `06-rbac.spec.ts`, `07-session-security.spec.ts`, `11-realtime-security.spec.ts`, `12-tenant-controls.spec.ts`
- `docs/GCO_CURRENT_STATE_TECHNICAL_AUDIT.md` §13, §41–44
- `docs/GCO_V1_HARDENING_REPORT.md` §12–14 (the two RBAC/content-isolation defects already found and fixed: `analytics/overview` previously lacked a permission gate letting `OPERATOR` read it; `conversations/[id]/suggestion` previously let `CLIENT` read AI draft content — both fixed as of `6ffc8d5`, confirm still fixed rather than assuming)
- `docs/GCO_FINAL_V1_READINESS_AUDIT.md` §4, §7, §20 (the messageCap race)

## Verification requirement

Any "this boundary still holds" claim must be backed by **actually re-running** the specific attacking test(s) this session via `gco-testing` — never asserted from code reading alone:
- Tenant isolation → `05-tenant-isolation.spec.ts`
- RBAC → `06-rbac.spec.ts`
- Session/token security → `07-session-security.spec.ts`
- WebSocket isolation → `11-realtime-security.spec.ts`
- Tenant status/messageCap enforcement → `12-tenant-controls.spec.ts`

Cite the exact test name and the exact result observed this session.

## Security constraints

- Read-only by default — this skill reports findings; it does not patch code. If a fix is wanted, hand off to `gco-engineering` (which will treat any RBAC/tenant-isolation edit as requiring explicit approval per its own boundary rules).
- Never print or log secret values (`AUTH_SECRET`, `DEV_WEBHOOK_SECRET`, database/Redis URLs, etc.) encountered while reading `.env` or code.
- Never declare a boundary "hardened" or "fixed" without a matching test result from this session.

## Relationship to other GCO skills

- Test execution for verification → delegate to `gco-testing`.
- If a finding requires a code change → hand off to `gco-engineering`, which owns the core-pipeline/RBAC boundary rules for what needs explicit approval.
- `gco-code-review` must defer any auth/RBAC/tenant-isolation finding to this skill rather than adjudicating it itself — if `gco-code-review` surfaces something here, treat it as an inbound referral, not a duplicate task.
- `gco-production-readiness` cites this skill's findings as an input to its security scorecard row rather than re-deriving them independently.

## Must never do

- Declare `messageCap` atomic — it is not, until an atomic implementation is built and freshly verified.
- Declare Docker, CI, or production infrastructure security posture "verified" — that is out of this skill's scope entirely (see `gco-production-readiness`); this skill only covers the application-layer threat surface listed above.
- Approve weakening a permission check or the tenant-scope resolver without an explicit, named business reason stated by the user.
- Invent a vulnerability class the code has no surface for, to pad a review.
- Claim real AI-provider or real-client-integration behavior is "secure" or "insecure" — no real provider or real client exists to evaluate (`AI_PROVIDER=mock`, `dev-mock` adapter only).
