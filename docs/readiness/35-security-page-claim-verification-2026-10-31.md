# 35 — Website Security page: statement-by-statement verification (31 Oct 2026)

Page: `https://globalconversationoperations.com/security` (source `lib/content/security.ts`, `app/security/page.tsx`). The live page text was compared with the repository on 31 Oct and **is identical**. Nothing below has been changed on the website: proposed wording needs the CEO's approval, and a website change goes live only with a release (no deployment is authorised now).

**Method.** Each statement was checked in code, in the automated tests, in the deployed commit (`d9af8dc`, so the statement is true of what runs in production today, not only of the release candidate), and, for external behaviour, against the public site on 31 Oct. **Verified** = code and test or live observation. **Revise** = true in part, or wording could mislead. **Do not use** = not currently supportable. The page's own header comment correctly lists what is *not* claimed (certifications, encryption at rest, MFA, penetration tests, uptime figures, data-residency commitments); that list stays.

## Verdicts

| # | Statement on the page | Verdict | Evidence / note |
|---|---|---|---|
| 1 | Role-based access, enforced on the server | **Verified** | `lib/auth/rbac.ts`; structural test `apiRouteAccessChecks` fails if an API route lacks a caller check; E2E `06`. |
| 1 | Separate roles for operators, supervisors, management, clients and sales users | **Verified** (supervisor and CTO roles ship with the release) | Role enum has 8 roles; supervisor team scoping is release-ready, not live. Say "supervisors" only after the release, or keep "managers". |
| 1 | Passwords stored hashed | **Verified** | bcrypt, cost 12 (`lib/auth/password.ts`). |
| 1 | Short-lived signed tokens in HTTP-only, same-site cookies; revoked on sign-out | **Verified** | Cookies `httpOnly`, `sameSite: strict`, `secure` in production (`app/api/v1/auth/login/route.ts`, same in the deployed commit); refresh tokens hashed and revoked at logout/password change; E2E `07`. |
| 2 | Client users pinned to their own tenant on the server | **Verified** | `lib/auth/tenantGuard.ts`; E2E `05`, `tests/unit/tenantGuard.test.ts`. |
| 2 | Client users see only client-facing information | **Verified** at route level | Per-field leak tests are planned (P0-9). |
| 2 | Cross-tenant access covered by automated tests | **Verified** | E2E `05`. **Revise:** add that isolation is enforced by the application, not by database row-level security (disclosed limitation). |
| 3 | Served over HTTPS; HTTP redirected | **Verified live** (31 Oct) | Both hosts answer HTTP with `308` to HTTPS. |
| 3 | Certificates issued and renewed automatically | **Revise** | Live certificate: Let's Encrypt, valid 26 Sep–25 Dec 2026, so issuance is automatic; **automatic renewal is not yet observed** (first renewal falls about November). Say "issued automatically" or verify the renewal first. |
| 3 | Cookies marked secure in production | **Verified** | Code above. |
| (absent) | Strict-Transport-Security, Content-Security-Policy | **Not live** | Live headers on 31 Oct: X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. No HSTS; report-only CSP ships with the release. Do not claim either. |
| 4 | Sign-ins and failed sign-ins, assignments, escalations, administrative changes are logged | **Verified** | `auth.login`, `auth.login_failed` and others via `writeAuditLog` (both in the deployed commit); tests assert content absence. |
| 4 | Entries designed not to contain secrets or internal-note text | **Revise** | True by convention at each call site, asserted by tests for the covered events, **not enforced by a technical control**. Keep "designed not to"; do not say "never". |
| 4 | Escalations keep a full timeline | **Verified** | `EscalationEvent`; E2E `20`. |
| 5 | HMAC-SHA256 signatures, separate secret per integration | **Verified** | `lib/integrations/adapters/gcoWebhook.ts`, contract doc, unit and E2E tests (verified against test doubles; no real client connected). |
| 5 | Invalid signatures rejected, nothing stored | **Verified** | Route returns 401 before parsing or storing (`webhooks/[integrationId]/route.ts`). |
| 5 | Duplicate deliveries detected | **Verified** | Dedup tests. |
| 6 | Sign-in, public forms and authenticated writes are rate limited | **Verified** | Contact and careers forms and login use the limiter; writes covered. Coverage is **38 of 162 route files**, so do not generalise to "all requests". Hidden spam trap and size limits are in the form routes. |
| 7 | Production database backed up every day | **Verified** | Systemd timer; nightly entries in the system log 24–29 Oct. |
| 7 | Each backup integrity-checked after creation | **Verified** | `pg_restore --list` check in the backup script (also in the deployed script). |
| 7 | Copy stored offsite with a separate provider, upload verified | **Verified** | Backblaze B2; log line "offsite upload to B2 verified" nightly. |
| 7 | Failures are surfaced rather than silently ignored | **Revise** | A failure is logged and the script exits non-zero, but **no automatic alert reaches a person today.** Wording: "Failures are written to the system log; automatic alerting is being added." |
| 7 | (not on the page) | **Add with evidence** | "Restore of a production backup was tested in an isolated environment on 29 Oct 2026 (twice)." Do **not** say backups are encrypted: client-side encryption is not active (no recipients file installed); only the provider's own storage encryption applies [confirm in the Backblaze account]. |
| 8 | Health checks cover application, database and queue layer | **Verified, with a precision** | Health endpoint checks the application, PostgreSQL and Redis (which hosts the queue); queue depth and error events are in the admin system-health view. |
| 8 | Structured application logs | **Verified** | JSON logs. |
| 8 | Failing background jobs retained for review | **Verified** | `removeOnFail: false`; dead-letter recovery E2E `09`. |
| 8 | (not on the page) | **Do not claim** | Uptime monitoring: UptimeRobot is "configured but unverified"; alerting to people is not in place. |
| 9 | Server-side secrets kept in server configuration, not exposed to the browser | **Verified (repository)** | Server-side hygiene itself was not re-inspected; keep wording as is. |
| 9 | "When AI-assisted drafting is used, conversation context is sent to a third-party AI service…" | **Revise (high priority)** | AI is **disabled platform-wide** and pinned off. The sentence reads as if AI processing happens. Proposed: "AI-assisted drafting is disabled. No conversation data is sent to any AI service. Enabling it would require written approval and notice to clients." |
| Lead | "This page describes controls that are in place today." | **Revise** | Keep only after the release for items marked release-ready (supervisor team scoping, two-factor, report-only CSP). Better: "This page describes controls verified by GCO's own testing. It is not a certification or an independent audit." |

## Statements that must not appear until evidence exists
GDPR "compliant", any certification (ISO 27001, SOC 2), "penetration tested", "encrypted backups", "end-to-end encryption", uptime or response-time figures, "data stays in the EU" as a commitment beyond the hosting facts below, "24/7 monitoring".

## Hosting facts that can be stated (with the caveats)
- Application and database run on a Hetzner Cloud server in **Nuremberg, Germany** (server name `…-nbg1-…`, Hetzner IP range; CEO account).
- **Traffic passes through Cloudflare** (the site answers as `server: cloudflare`): Cloudflare terminates the public TLS connection and is a sub-processor for traffic. The page does not mention it; a partner's lawyer will see it in the headers. Disclose it. [confirm Cloudflare's SSL mode is Full (strict) so that the leg to our server is also encrypted.]
- Offsite backups in a Backblaze B2 bucket [confirm bucket region].
- Company email on Google Workspace (Ireland); Zoho still in the SPF record until retired.

## Proposed replacement text (not applied)

> **Backups.** The production database is backed up every night and each backup is checked for readability. A copy is stored offsite with a separate provider, and the upload is verified. Backup restoration was tested in an isolated environment in October 2026. Failures are written to the system log; automatic alerts are being added.
>
> **Operational data handling.** Server-side secrets are kept in server configuration and are not exposed to the browser. AI-assisted drafting is disabled: no conversation data is sent to any AI service, and enabling it would require written approval and notice to clients.
>
> **Closing.** This page describes controls GCO has verified through its own testing. It is not a certification or an independent audit. Additional security and data-handling requirements can be reviewed during onboarding.

## What a partner such as Norforst will ask next
Hosting location and sub-processors (above), a DPA with technical annex (`docs/technical-security-pack/12-dpa-technical-annex-DRAFT.md`), breach procedure (`docs/legal-drafts/09-…`), retention and deletion, access by staff outside the EU, backups and encryption, independent testing (none yet), and legal entity details (CEO). All are answered honestly in doc 36 and the annex, with the gaps stated.
