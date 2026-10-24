# 19 — Internal security self-assessment (OWASP ASVS-aligned), 2026-10-23

**What this is.** An internal, evidence-based self-assessment of the **application layer**, organised by the chapters of OWASP ASVS 4.0.3. It uses code review plus tests run **this session** (commit `9746d13`, local stack). **It is not a certification, a penetration test, or a claim of ASVS compliance.** It does not cover the server, Docker, TLS configuration, backups or any real client integration (see `18` for data access, and `09` for infrastructure items).
**Method limits.** I read the code and ran the existing attack tests. The OWASP ZAP scan is **not done**: the CEO approved it for staging only, and staging does not exist yet. Chapter-level mapping only; I did not tick individual ASVS requirement numbers.
**Status vocabulary:** VERIFIED (code and a test this session) · PARTIAL · MISSING · NOT VERIFIED.

## 1. Test evidence from this session
Full run: type check and lint clean; 721 unit, 217 integration, 297 end-to-end passed, 2 skipped, 2 failed (the AI-feature specs, AI is off by design). Attack-focused specs, all passing in that run:
| Boundary | Spec | Result this session |
|---|---|---|
| Tenant isolation | `05-tenant-isolation` | 7 passed, 0 failed |
| RBAC | `06-rbac` | 8 passed, 0 failed |
| Session and token security | `07-session-security` | 6 passed, 0 failed (includes forged/missing tokens, logout invalidation, login error parity, privilege escalation via body) |
| WebSocket isolation | `11-realtime-security` | 6 passed, 0 failed |
| Tenant status / message cap | `12-tenant-controls` | 3 passed, 0 failed |
| Webhook secrets and signatures | `18-webhook-security` | passing in the same run |

## 2. Findings (what needs action)
| # | Finding | ASVS chapter | Severity (my view) | Evidence | Recommended fix | Needs approval? |
|---|---|---|---|---|---|---|
| F1 | **No HSTS and no Content-Security-Policy** on the live site and app. Other headers are present (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`). | V14 Configuration | Medium | `next.config.js` lines 20–23 set four headers only; a read-only `curl -I` of both production hostnames showed no `strict-transport-security` or `content-security-policy` | Add HSTS (via Caddy or Next headers) after confirming HTTPS everywhere; add CSP **in report-only mode first**, then enforce. Test on staging | Yes, a production change |
| F2 | **Two-factor sign-in is optional and not enforced** for privileged roles (CEO/Assistant/Manager). The feature exists and is tested. | V2 Authentication | Medium–High for CEO accounts | `app/api/v1/auth/2fa/*`, `lib/auth/twoFactor.ts`: "nothing is enforced at sign-in until the first code is confirmed" | Enrol every staff account now; then enforce for privileged roles in code | Code change: yes |
| F3 | **Message text and database dumps are not encrypted by GCO** (plain text in PostgreSQL, plain `pg_dump` upload to B2). | V6 Cryptography, V8 Data protection | Medium | `prisma/schema.prisma` `Message.content String @db.Text`; `scripts/backup-postgres.sh`; detail in `18` | Encrypt dumps before upload (age/GPG, key held offline by the CEO). Field-level encryption of message text is a larger design decision for later | Yes (backup script and key custody) |
| F4 | **Signing-secret strength is only checked at 16 characters** for the HS256 token secret. | V6 Cryptography / V3 Session | Low | `lib/auth/tokens.ts` line 13: `secret.length < 16` | Raise the minimum to 32 characters; confirm the production secret is a random 32+ byte value (I cannot read it and must not) | Code change plus a production secret check |
| F5 | **No dedicated CSRF token.** Protection relies on `SameSite=Strict` cookies plus JSON bodies. | V4 / V13 | Low (accepted) | cookie flags in `app/api/v1/auth/login/route.ts` (`httpOnly`, `sameSite: 'strict'`, `secure` in production) | Accept; add an Origin check on state-changing routes as defence in depth | Optional |
| F6 | **Rate limiting covers 38 of 162 route files.** Login (10 per 15 minutes per IP and email), webhooks and authenticated writes are covered; many authenticated reads and some public routes may not be. | V13 API / V11 Business logic | Low–Medium | grep of `isRateLimited` in `app/api` | Review the uncovered public routes first; add limits where an anonymous caller could write or scan | Code change |
| F7 | **No error tracking, no paging.** Audit logging exists (49 source files write audit entries). | V7 Logging | Medium (operational) | no Sentry code; `SENTRY_DSN` empty | Free-tier monitoring with message bodies scrubbed (plan in `17`/the readiness plan) | Account creation |
| F8 | **Tenant isolation is application-layer only** (no PostgreSQL row-level security). | V4 Access control | Known, accepted | `docs/decisions.md` and earlier audits; the isolation specs above pass | Keep; consider row-level security later as defence in depth | No |
| F9 | **`messageCap` is a soft ceiling**, not an atomic limit (small overshoot possible under concurrency). | V11 Business logic | Low | documented race in `lib/tenant/activity.ts` | Document to clients; atomic reservation is a later engineering item | No |

## 3. What looks sound (checked, with evidence)
| Area | Result |
|---|---|
| Passwords | bcrypt cost 12; staff password policy enforced (minimum 10 characters on invitation); change-password signs the account out elsewhere; login errors do not reveal whether an email exists (`07` test). VERIFIED |
| Sessions | HS256 tokens with expiry (60 minutes default), refresh tokens stored server-side (30 days), logout revocation tested, realtime tickets are a separate 30-second token type. VERIFIED by `07` and `11` |
| Cookies | `httpOnly`, `SameSite=Strict`, `secure` in production. VERIFIED in code |
| Access control | Central permission matrix plus tenant guard; role and cross-tenant attacks tested (`05`, `06`). VERIFIED |
| Input validation | Every route that reads a JSON body validates it with a Zod schema (one route flagged by my first search validates through a named schema). VERIFIED by code review |
| SQL injection | Raw SQL appears only as tagged-template, parameterised statements (`SELECT 1`, advisory locks, one scoped `UPDATE`). VERIFIED |
| Cross-site scripting | The only `dangerouslySetInnerHTML` serialises our own JSON-LD and escapes `<`. VERIFIED |
| Webhooks | HMAC-SHA256 with timing-safe compare and per-integration secrets, tested (`18`). VERIFIED |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities. VERIFIED. CI execution: NOT VERIFIED |
| Secrets in the repository | Earlier history scan clean (`09` checklist); not repeated in this assessment. NOT RE-VERIFIED |

## 4. Not covered here
Server hardening, TLS settings, firewall, SSH policy, Docker image security, backup restore, third-party penetration test, real client integrations, real AI provider. Dynamic testing with OWASP ZAP is planned for **staging only** and is NOT DONE.

## 5. Residual risks to accept or fix before the first real client
F1, F2 and F3 are the three I would close first (all can be done at no cost). Until F3 is fixed, real client conversations should not be stored (consistent with the CEO's decision to use fictional data until safeguards exist).

## 6. Next steps
1. CEO decision on F1–F4 (each is a change; none made).
2. Build staging, then run OWASP ZAP baseline against staging only; add results to this file.
3. Re-run the affected specs after any fix and update the status here.
