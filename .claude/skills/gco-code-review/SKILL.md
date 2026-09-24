---
name: gco-code-review
description: General correctness, maintainability, duplication, and error-handling review of GCO diffs against the repository's existing conventions (Zod validation, lib/api/response.ts patterns, idempotency, tenant-scoping). Read-only by default. Defers all auth/RBAC/tenant-isolation security decisions to gco-security-review rather than adjudicating them itself.
---

# GCO Code Review

## Purpose

Review GCO diffs for correctness, maintainability, duplication, and error-handling quality against the repository's **actual existing conventions** — this is distinct from `gco-security-review`'s threat-modeling lens. This skill catches bugs, redundant logic, inconsistent patterns, and unnecessary complexity; it does not rule on authentication, RBAC, or tenant-isolation questions.

## Scope boundary vs. gco-security-review (explicit handoff rule)

If a diff touches `lib/auth/*`, `middleware.ts`, a route's `requirePermission`/`assertCan` call, `lib/tenant/activity.ts`'s enforcement points, or `resolveTenantScope` usage, this skill must **not** independently judge whether the change is secure. It should note that the diff touches a security-relevant boundary and explicitly hand off that portion of the review to `gco-security-review`, then continue reviewing the rest of the diff (naming conventions, error handling, duplication) on its own merits.

## When to invoke automatically

- The user asks to review a diff or PR in this repository.
- As a second pass after `gco-engineering` or `gco-integration` produces a change, before considering it done.

## When NOT to invoke

- As a substitute for `gco-security-review` on any diff touching the boundary listed above.
- To apply fixes — this skill reviews by default; it does not edit code unless the user explicitly asks it to apply the findings (in which case any edit still follows `gco-engineering`'s core-pipeline boundary rules).

## GCO-specific conventions checklist

Review against what the codebase actually does, not generic best practice:

- **Zod validation**: every route parses its body with a `Schema.parse(await req.json())` pattern; a new route that skips this, or duplicates validation logic already expressible as a Zod schema, is a finding.
- **`lib/api/response.ts` conventions**: routes should return via `ok`/`created`/`paginated`/`fail`, and let `handleRouteError` classify thrown errors (`ZodError`/`SyntaxError` → 400, an error with `.status` → that status, everything else → generic 500 with full detail logged server-side only, never echoed to the client). A route that constructs its own ad hoc error response, or that leaks an internal exception message to the client on a 500, is a finding.
- **Idempotency patterns**: GCO's core guarantees rely on database-level unique constraints (`WebhookEvent(integrationId, externalEventId)`, `Message(tenantId, externalMessageId, direction)`, `Conversation.currentAssignmentId`, `UsageRecord.messageId`/`.idempotencyKey`) rather than application-level "check then insert" logic. New write paths that introduce a check-then-write race where a unique constraint should instead be relied upon are a finding — note the existing `messageCap` TOCTOU race (`lib/tenant/activity.ts`) as the known example of this exact class of issue, already reported and accepted as a soft ceiling, not something to silently "fix" as part of an unrelated review.
- **Tenant-scoping pattern**: any new query touching tenant-owned data should route through `resolveTenantScope`, matching the pattern in existing routes — a query that accepts a client-supplied `tenantId` without going through that resolver is a finding, but the security *severity* of that finding is `gco-security-review`'s call, not this skill's.
- **Duplication/reuse**: point at the actual existing code being duplicated, not a generic "consider extracting a helper" comment.
- **Complexity**: flag abstractions or generalized frameworks introduced for a one-off need, per this repo's own stated engineering discipline (see `AGENTS.md`/root `CLAUDE.md` and `docs/decisions.md`'s "Assignment policy is intentionally simple in V1" precedent).

## Finding format

Every correctness finding must show a concrete failure scenario: specific input/state → wrong output or crash. Not a style opinion. Every "this duplicates X" claim must name the actual file/function being duplicated. Confirm findings against a fresh read of the current file — not memory of an earlier version of it.

## Required repository context

- The diff under review.
- `lib/api/response.ts` (the error-classification/response convention).
- Neighboring route files for consistency (how similar existing routes call `requirePermission`/`resolveTenantScope`/Zod schemas).
- `docs/decisions.md` when a diff appears to second-guess a documented, deliberate tradeoff (e.g., "why isn't assignment skill-based" — see "Assignment policy is intentionally simple in V1").

## Security constraints

- Read-only by default — report findings, do not patch, unless explicitly asked.
- Any auth/RBAC/tenant-isolation-adjacent observation is a **referral** to `gco-security-review`, not a finding this skill resolves itself.

## Relationship to other GCO skills

- Auth/RBAC/tenant-isolation findings → hand off to `gco-security-review`; do not duplicate its checklist here.
- Test coverage claims about a finding → verify via `gco-testing` before asserting a test exists or is missing.
- If the review concludes a fix is warranted and the user wants it applied → `gco-engineering` performs the edit, subject to its own core-pipeline boundary.
- If the diff is under `lib/integrations/**` → note that `gco-integration` owns the client-spec gate for that area; this skill can still review code quality within an adapter file.

## Must never do

- Clear an auth/RBAC/tenant-isolation finding as "fine" without deferring to `gco-security-review`.
- Suggest a core-pipeline rewrite (queue, assignment, AI service, realtime, auth token issuance) as a "simplification" — that crosses into `gco-engineering`'s core-pipeline boundary and needs explicit approval, not a review-driven nudge.
- Apply fixes without being asked.
- Claim test coverage exists (or is missing) for a finding without actually checking `tests/unit`, `tests/integration`, or `tests/e2e`.
- Re-litigate the `messageCap` soft-ceiling behavior as a new finding — it is already known, reported, and tracked; note it only if a diff changes its behavior.
