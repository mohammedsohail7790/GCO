# 22 — Fixes F1 to F4 on staging, and the remaining risks (rate limiting, CSRF, monitoring)

**Status:** plan. **Approved:** prepare and test F1–F4 **on staging**. **Not approved:** production deployment (needs the CEO's separate approval after he reviews the results). Nothing has been changed. Before writing any code I must read the Next.js guides in `node_modules/next/dist/docs/` (this repository's Next.js version differs from what I know), then run the tests via the repository's testing procedure.

## 1. The four fixes
| # | Fix | How it will be done | Test | Risk to watch |
|---|---|---|---|---|
| F1a | **HSTS** | Add `Strict-Transport-Security` at the edge (Caddy) or in Next headers. **Start with a short `max-age`** (e.g. 5 minutes), then raise to months after a clean observation. No `includeSubDomains` or `preload` at first, because staging and other subdomains exist | `curl -I` shows the header on staging; site still loads over HTTPS | A wrong HSTS value is sticky in browsers. Raise gradually. An alternative is Cloudflare's own HSTS setting (a Cloudflare account change that needs approval) |
| F1b | **Content-Security-Policy** | Add in **report-only** mode first, collect violations on staging, then enforce. Next.js needs nonces or hashes for its own scripts, so the policy is derived from the guide in `node_modules` | staging pages load with no console CSP errors; report log reviewed | An enforced CSP can break pages or third-party embeds (the Calendly link). Report-only first |
| F2 | **Enforce two-factor for privileged roles** | Enrol every staff account (CEO, assistant, managers) first. Then a setting that, for those roles, sends a user without two-factor to enrolment and blocks the rest of the app. Default **off** in tests so the existing E2E fixtures keep working; a dedicated test covers "on" | new unit and E2E tests for the enforced path and for recovery codes | Locking the CEO out: keep recovery codes, a documented reset path via break-glass |
| F3 | **Encrypted backups** | See `docs/readiness/20` | restore test passes | Key loss, covered by custody rules |
| F4 | **Signing secret length** | Raise the minimum from 16 to 32 characters in `lib/auth/tokens.ts`; update `.env.example` and the CI test value. **The CTO checks the production secret's length on the server without printing it** (for example count the characters only) and rotates it if shorter, in a planned window because rotation signs everyone out | unit test for the minimum; staging uses a fresh 32+ byte secret | A rotation logs out all users once. Do it outside business hours |
After staging results exist I send the CEO: what changed, the diff summary, the test results, and a production rollout and rollback note for each fix, and **wait for his approval** before anything touches production.

## 2. Remaining risks to document and decide
| Risk | Today | Plan | Residual risk if left |
|---|---|---|---|
| **Rate limiting** covers 38 of 162 route files | Login, webhooks and authenticated writes covered; many authenticated reads and some public routes are not | Inventory every route by exposure (public, authenticated, internal). Add limits first to **public routes that accept input or reveal data** (contact, careers, invitation acceptance, any lookup). Add a default per-IP limit at the edge (Cloudflare free rate-limiting rules, if available [verify]) | Low-Medium: abuse of an unlimited read route or scraping |
| **CSRF** | No token; defence is `SameSite=Strict`, `httpOnly` cookies and JSON-only bodies | Add an `Origin`/`Host` check for state-changing methods as defence in depth | Low |
| **Monitoring** | No error tracking, no paging, UptimeRobot not configured | Free-tier uptime monitor for the two sites and `/health`; a heartbeat for the backup job; error tracking with message bodies stripped before sending; alerts to email on Google Workspace | Medium (operational): an outage or a failed backup could go unnoticed |
| Tenant isolation is application-layer only; `messageCap` soft | Known, accepted; tests pass | Revisit with row-level security and an atomic cap as later engineering items | Accepted |

## 3. Costs
All items €0 on free tiers; any paid option would be listed with a price for the CEO's approval.

## 4. Progress log (2026-10-23, local machine only; nothing deployed anywhere)
| Fix | State | Evidence this session |
|---|---|---|
| **F1** HSTS and CSP | **Implemented locally, not deployed.** `lib/config/securityHeaders.js`, used by `next.config.js`. CSP is **report-only** and, per the Next.js guide in `node_modules`, **does not use nonces** (a nonce policy would force every page, including the static marketing pages, to render dynamically). So it keeps `'unsafe-inline'` for scripts and styles; this is weaker than a nonce policy and is the stated trade-off. HSTS is **opt-in per environment** (`HSTS_MAX_AGE_SECONDS`, no `includeSubDomains`/`preload`). **Both are fixed at build time**, so each environment must be built with its own value. | New unit test (4 cases); a local production build served the headers (`curl -I`: CSP-Report-Only and `max-age=300`); home, login, platform and contact loaded with no console CSP messages and only same-origin resources. **Not yet checked:** the signed-in console and the realtime WebSocket (needs staging); the policy is report-only, so nothing is enforced. |
| **F4** secret length | **Implemented locally, not deployed.** Minimum 32 characters in `lib/auth/tokens.ts` and `lib/auth/secretBox.ts` (the CEO approved F1 to F4; this file is on the core-boundary list, which I am recording here). `.env.example` updated. | New unit test (rejects 31, accepts 32, round trip); full unit suite 727 passed; local secret is 64 characters. **Production secret length still unchecked** (CTO checks the character count on the server without printing it). |
| **F2** enforce two-factor | **Implemented locally (option A), off by default, not deployed.** `lib/auth/twoFactorPolicy.ts` and a check in the login route: when `REQUIRE_TWO_FACTOR_ROLES` lists a role (for example `CEO_ADMIN,ASSISTANT,MANAGER,CTO`), an account in that role without two-factor is refused **after** the password is verified (403, `TWO_FACTOR_ENROLMENT_REQUIRED`, audited). **Enrol every such account before turning it on.** | 3 unit tests pass; on a real production build with the setting at `MANAGER`: a manager without two-factor got 403 with the code above, a wrong password still got 401, operator and admin still signed in (200). The setting was then turned off again. **Not added:** an end-to-end spec (needs the server started with the setting). |
| **F3** encrypted backups | **Implemented and tested locally; not deployed.** age-based encryption with two recipients; see `docs/readiness/20` section 6 for the results. | Encrypt, decrypt with each key, wrong key, refusals and a full restore from the `.age` file all passed locally. |
| Staging limits | **Prepared in the repository** (`docker-compose.staging.yml`: memory and CPU limits, about 1.1 GB total). Not run under Docker (none available here). | YAML parsed and values read back |

### Important finding: rotating `AUTH_SECRET` has a side effect
`lib/auth/secretBox.ts` derives the key that protects stored two-factor seeds from `AUTH_SECRET`. **Rotating the secret makes every stored seed unreadable: all two-factor users must re-enrol.** If two-factor is later enforced, a rotation could lock privileged users out. Rotate only in a planned window, with break-glass ready and new enrolment steps documented.

### F2 design options (the CEO or the CTO to choose)
| Option | How | Pros | Cons |
|---|---|---|---|
| **A. Operational first (recommended)** | Enrol every existing privileged account (CEO, assistant, managers) now. Add a setting `REQUIRE_TWO_FACTOR_ROLES`; when set, sign-in is refused for those roles without two-factor. New privileged accounts are enrolled by a one-time process before the setting is on, or the setting is briefly off. | Small change; no weakening; easy to test | A new privileged user cannot enrol on their own while enforcement is on |
| B. Limited session | Sign-in succeeds but the session can only reach the enrolment page until two-factor is on | Smooth for new users | Touches session and middleware code (core boundary): larger and riskier |
| C. Do not enforce in code | Rely on policy and periodic checks | None to build | Weakest |
The setup endpoints require a signed-in session, which is why a simple login block would lock out a brand-new privileged account.
