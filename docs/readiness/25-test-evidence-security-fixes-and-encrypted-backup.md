# 25 — Test evidence: security fixes F1–F4 and the encrypted backup restore

**Date:** 2026-10-23. **Where:** the CTO's local machine only (local PostgreSQL 16, Redis, Next.js production build). **Data:** the local test database, which holds simulated/fictional data only. **Nothing was run on the server, in production, or against real client data. Nothing is committed or deployed.** Base commit `9746d13`; the changes are uncommitted in the working tree.

## 1. What changed (files)
| Fix | Files |
|---|---|
| F1 headers | `lib/config/securityHeaders.js` (new), `next.config.js` |
| F2 two-factor policy | `lib/auth/twoFactorPolicy.ts` (new), `app/api/v1/auth/login/route.ts` |
| F3 encrypted backups | `scripts/encrypt-backup.sh`, `scripts/decrypt-backup.sh` (new); `scripts/backup-postgres.sh`, `scripts/restore-production-dump.sh` (changed) |
| F4 secret length | `lib/auth/tokens.ts`, `lib/auth/secretBox.ts`, `.env.example` |
| Staging limits | `docker-compose.staging.yml` (memory and CPU caps) |
| Tests added | `tests/unit/securityHeaders.test.ts` (4), `authSecretStrength.test.ts` (2), `twoFactorPolicy.test.ts` (3) |

## 2. Automated suites after the changes
| Suite | Command | Result |
|---|---|---|
| Type check, lint | `npm run typecheck`, `npm run lint` | no errors printed |
| Unit | `npm test` | **50 files, 730 passed** |
| Integration | `npm run test:integration` | **34 files, 217 passed** |
| End-to-end (spot check, against the rebuilt app) | `07-session-security`, `05-tenant-isolation`, `06-rbac`, `29-account-lifecycle` | **23 passed** |
| End-to-end, full suite | not re-run after these changes | last full run (before them, same day): 297 passed, 2 skipped, 2 failed (the AI-feature specs, expected, AI is off) |

## 3. Per-fix evidence
**F1 (HSTS, CSP report-only).** A production build was started on a separate port with `HSTS_MAX_AGE_SECONDS=300`. `curl -I /login` returned: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self'; connect-src 'self' ws://localhost:3001; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` and `Strict-Transport-Security: max-age=300`. The home, login, platform and contact pages loaded in a browser with **only same-origin resources and no console messages**. **Not tested:** signed-in pages and the realtime connection (need staging); the policy is report-only, so nothing is enforced.
**F2 (two-factor policy).** 3 unit tests. On a real production build started with `REQUIRE_TWO_FACTOR_ROLES=MANAGER`: manager (no two-factor) → **403 `TWO_FACTOR_ENROLMENT_REQUIRED`**; manager with a wrong password → **401** (no information leak); operator → 200; admin (not listed) → 200. The setting was then turned off. **Not tested:** a listed account that **has** two-factor signing in successfully through the same build (the existing two-factor tests cover that path unchanged); an end-to-end spec.
**F3 (encrypted backups, `age` v1.3.2).** On a real dump of the local test database (236,089 bytes, 29 migrations, 61 tables):
| Check | Result |
|---|---|
| Encrypt to 2 recipients | OK; 236,435-byte `age` file, header `age-encryption.org/v1`, no dump header |
| Decrypt with the primary key | OK, **byte-identical** to the original |
| Decrypt with the recovery key | OK, **byte-identical** |
| Decrypt with a wrong key | fails, exit 3, no output file left |
| One recipient only / a private key in the recipients file | both refused (exit 2), nothing written |
| Full restore from the `.age` file via `restore-production-dump.sh` (recovery key) | **PASS**: 29 migrations, 61 tables, counts Tenant=6, User=9, Message=14…, **14 integrity checks, 0 violations**; the decrypted temporary file was removed |
**Not tested:** the actual `backup-postgres.sh` run (needs Docker and the production layout), uploading a `.age` file to Backblaze, restoring on a server, and the 2-key custody process in real life. The downloaded `age` binary matched the sha256 digest GitHub publishes; its signature proofs were not verified.
**F4 (secret length).** 2 unit tests: 31 characters rejected for signing and for the secret box; exactly 32 accepted, with a token round-trip and a secret-box round-trip. The local secret is 64 characters. **Production secret length: unchecked.**

## 4. How to repeat any of it
`npm test`, `npm run test:integration`, `npx playwright test tests/e2e/07-session-security.spec.ts …` with the local stack up. The encrypted backup test steps are in `docs/readiness/20` sections 6 and 7.
