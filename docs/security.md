# Security

## Authentication

- Passwords hashed with bcrypt (cost 12).
- Session model: short-lived JWT access token (HS256, `AUTH_SECRET`) in an `httpOnly`, `Secure` (prod), `SameSite=strict` cookie, plus a long-lived opaque refresh token stored in `Session` (revocable, one row per device/login).
- Login rate-limited per (IP, email) via `lib/api/rateLimit.ts` (Redis-backed - holds up across multiple app instances, unlike an earlier in-memory version).
- Logout actually revokes the refresh token server-side (`Session.revokedAt`) and clears both cookies with matching `path` attributes - a prior bug had the refresh cookie's `path` scoped so narrowly that `/auth/logout` never received it and couldn't revoke it, silently leaving the session valid after "logout" (found and fixed via `tests/e2e/07-session-security.spec.ts`).

## Authorization (RBAC)

- Central permission matrix in `lib/auth/rbac.ts`. Every sensitive API route calls `requirePermission`/`assertCan` - the frontend role-based routing in `middleware.ts` is a UX convenience only and is not trusted for authorization.
- Roles: `CEO_ADMIN`, `MANAGER`, `ASSISTANT`, `OPERATOR`, `CLIENT`.

## Tenant isolation

- Enforced in `lib/auth/tenantGuard.ts::resolveTenantScope`, called by every tenant-scoped route. A `CLIENT` session's `tenantId` from the JWT always wins over any `tenantId` supplied in a query/body - a client cannot widen scope by editing a request.
- Every tenant-sensitive Prisma query includes `tenantId` in its `where` clause.
- Covered by `tests/unit/tenantGuard.test.ts`.

## Webhook authenticity

- `IntegrationAdapter.verifyWebhookSignature` performs an HMAC-SHA256 timing-safe comparison before any payload is parsed or persisted.
- Rate-limited per-integration (`lib/api/rateLimit.ts`, 3000/min) before signature verification even runs, so a flood against one integration can't burn CPU on other tenants' legitimate traffic.
- Exact-replay of a captured request is a no-op (dedup, not just accepted-and-ignored) since the same signature/body hash lands on the same `WebhookEvent` row.

## Input/output validation

- All request bodies parsed with Zod schemas; invalid input returns 400 before touching the database.
- AI provider output is validated against `SuggestedReplySchema`/`ExtractedFactSchema` before being trusted anywhere downstream.

## Secrets

- Nothing is hardcoded; all secrets come from environment variables (`.env`, never committed - see `.gitignore`).
- `Integration.secretRef` stores a reference/name, never the raw webhook secret, in the database.
- Audit logs never include secret values (see `writeAuditLog` docstring).
- `.dockerignore` excludes `.env*` from the Docker build context - Next's standalone build output copies any `.env` sitting next to `next.config.js`, so without this a developer's local `.env` could get baked into an image layer. Confirmed this was live before the fix (see `docs/production-readiness-audit.md` section 2.5). Production secrets are injected at container *runtime* via `docker-compose.yml`'s `env_file: .env`, never baked into the image.

## Headers & transport

- `next.config.js` sets `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on every response.
- Cookies are `Secure` in production (HTTPS-only) and `SameSite=strict`, which is the primary CSRF defense for cookie-authenticated mutations; state-changing routes should additionally be restricted to same-origin `fetch` (already the case via `credentials: 'include'` from `lib/api/client.ts`).

## Audit logging

- `writeAuditLog` (`lib/audit/log.ts`) is called for: login/login-failure, message send, manual reassignment, ticket create/update, tenant/user creation, dead-letter requeue. Every entry captures actor, action, resource, resourceId, tenant, timestamp, and IP.

## Automated coverage (see `docs/testing.md`)

All of the following are now real, passing, automated tests (`tests/e2e/`), not just manual checklist items:

- Broken access control: a CLIENT/MANAGER/OPERATOR token cannot fetch another tenant's conversations, usage, tickets, or AI suggestions by editing `tenantId` or guessing an id (`05-tenant-isolation.spec.ts`).
- Webhook spoofing: a request with an invalid signature is rejected with 401 and nothing is persisted (`02-webhook-integrity.spec.ts`).
- Duplicate webhook delivery does not create a second message or usage record (`02-webhook-integrity.spec.ts`).
- RBAC boundaries per role, including that ASSISTANT/CEO_ADMIN are the only global-operational roles (`06-rbac.spec.ts`).
- Session tampering: forged JWTs, garbage tokens, and stale refresh tokens after logout are all rejected (`07-session-security.spec.ts`).
- Dead-letter recovery is permission-gated and audited (`09-dead-letter-recovery.spec.ts`).

## Known gaps (see `docs/production-readiness-audit.md` for full detail)

- The webhook/write rate limits are global constants, not yet per-integration-configurable.
- No timestamp-based replay window on webhooks beyond exact-body dedup (low priority until a real client's spec is known).
