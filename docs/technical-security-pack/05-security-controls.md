# 05 — Security controls

Evidence column paths are repository-internal. "Verified" = code plus a test executed in a local/test environment on 2026-10-20 (see 11). No third-party security audit or penetration test has been performed.

| Control | What is implemented | Evidence | Status |
|---|---|---|---|
| **Authentication** | bcrypt (cost 12) password hashes; HS256 JWT access tokens; hashed refresh tokens with revocation on logout/password change; login rate limit (10 per 15 min per IP+email); optional authenticator-app 2FA with single-use recovery codes and replay protection; staff password policy | `lib/auth/*`; E2E `07`, `29`, `35` | Verified |
| **Role-based access** | 8 roles, central permission matrix, backend enforcement only; a structural test fails if any API handler lacks a caller check unless listed as public/independently authenticated | `lib/auth/rbac.ts`; `tests/unit/apiRouteAccessChecks.test.ts`; E2E `06`, `16`, `39` | Verified |
| **Tenant isolation** | every record scoped by tenant; tenant derived from the session, never from client input (clients) or checked against it (staff); supervisors limited to their team; cross-tenant ids answer 404/403 | `lib/auth/tenantGuard.ts`, `teamScope.ts`; E2E `05`, `20`, `39`–`51` | Verified at application layer; **no database row-level security** |
| **API and webhook security** | per-integration secrets; HMAC verification, replay window (production adapter), 1 MB limit, validation before persistence, rate limits, idempotency, bounded retries | `app/api/v1/webhooks/*`; unit `gcoWebhookAdapter`; E2E `02`, `18` | Verified (test doubles) |
| **Outbound request safety (SSRF)** | https only, no credentials in URL, default port, no redirects, destination address checked inside the connection's DNS lookup (blocks private, loopback, link-local, metadata, CGNAT, reserved, IPv4-mapped IPv6; defeats DNS rebinding) | `lib/integrations/safeHttp.ts`; unit tests | Verified |
| **Input validation** | Zod schemas on every body/query that writes; length caps on text; strict objects reject unknown fields | route code; tests | Verified |
| **Secrets management** | secrets only in server environment files and the database; none in Git (history scanned); per-integration webhook secrets; invitation tokens stored as hashes; secrets never logged or placed in audit rows | repository scan; tests | Verified (repository); server-side hygiene **not verified** |
| **Encryption and transport** | TLS at Cloudflare and Caddy; WebSocket over TLS; B2 server-side encryption; TOTP seeds encrypted at rest; **database not encrypted at the application level; backups not client-side encrypted** | docs; `lib/auth/secretBox.ts` | Partially implemented |
| **Data access and audit logging** | audit entries for sensitive actions with ids/counts only (never message content, tokens, subject ids); before/after on configuration, rates, billing, privacy | `AuditLog`; tests assert content absence | Verified |
| **Backup protection** | private bucket, scoped key, local files 0600; **key can delete offsite files; dumps contain integration secrets** | `docs/disaster-recovery.md` | Partially implemented (open findings) |
| **Dependency management** | `npm audit` clean (0 production vulnerabilities, 2026-10-20); no major upgrades without tests; no Dependabot | audit log | Verified (point in time) |
| **Environment separation** | production, staging and development flags; staging has own secrets/data, refuses real adapters, noindex, banner; production refuses dev adapters | E2E `37`, `38` | Verified locally; deployment **not verified** |
| **Error handling / incident investigation** | generic client errors, server-side structured logs, system events, alerts by role, audit trail | `lib/api/response.ts`; tests | Verified; no error-tracking service |
| **AI-disabled operating mode** | master switch default off; external provider needs a second approval; pinned off in deployment files; stale jobs are no-ops | unit, integration, E2E `52` | Verified |
| **Rate limiting / abuse protection** | Redis fixed windows: login, writes, public forms, per-integration webhooks | integration `rateLimit` | Verified |
| **Account recovery / admin 2FA** | CEO can enable 2FA; recovery codes; operator reset tool | E2E `35` | Verified; 2FA is optional, **not enforced** |

## Known gaps (also in 11)
No external penetration test; no WAF beyond Cloudflare Free; no row-level security; 2FA not enforced; no secret-rotation schedule; no centralised log shipping or error tracking; production server hardening was documented earlier but **not re-inspected** in this audit.
