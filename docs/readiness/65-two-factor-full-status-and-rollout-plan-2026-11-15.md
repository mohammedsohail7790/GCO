# 65 — Two-factor sign-in: full status and rollout plan (15 Nov 2026)

**Status:** correction and completion of what I told the CEO on 14 Nov. All three pieces below already exist in this release branch, each with its own passing test, re-verified today. None of it is in production yet — production is still the 12 Oct build, before this feature existed. Nothing here has been activated or enforced anywhere.

## 1. What already exists (verified fresh today)
| Piece | What it does | Where | Verified |
|---|---|---|---|
| Enrolment screen | Any signed-in user can turn on two-factor from their own account page: scan a QR code or type a short key into an authenticator app, confirm with a 6-digit code and their password, save one-time recovery codes | `components/account/TwoFactorSection.tsx`, `app/account/page.tsx` | `tests/e2e/35-two-factor.spec.ts`, both tests passed fresh this session |
| Sign-in enforcement | Once on, signing in needs the password **and** a current code (or a recovery code) | `app/api/v1/auth/login/route.ts`, `lib/auth/twoFactor.ts` | Covered by the same e2e test and `tests/integration/twoFactor.test.ts` |
| Recovery if the phone is lost | **Self-serve:** a one-time recovery code works once, shown only at setup time, and can be regenerated from the account page while still signed in. **Operator reset (break-glass):** if someone loses both their phone and their recovery codes, I run one script directly on the server for that one account — it turns two-factor off for them, signs out all their sessions, and logs who did it and when; it never reads or prints any password or secret. They then set two-factor up again themselves from the account page | `prisma/ops/reset-2fa.ts` | Reviewed just now; the e2e test above exercises the normal recovery-code path |
| Per-role enforcement | A single setting (`REQUIRE_TWO_FACTOR_ROLES`, e.g. `CEO_ADMIN,MANAGER,CTO`) can require two-factor for named roles. **Off today** | `lib/auth/twoFactorPolicy.ts` | Code read; not yet turned on anywhere |

## 2. What this means for "prepare the 2FA recovery procedure"
There is no separate procedure to design — the mechanism already does what the CEO asked for. What's left is making sure it's used correctly:
- **Before enforcement is ever turned on for a role, every account holding that role must already have two-factor enabled.** Turning on enforcement for an account that hasn't enrolled locks that person out at sign-in (`twoFactorPolicy.ts`'s own comment states this plainly).
- **The recovery script is a production action.** Running it means SSHing into the production server once this release is live. It needs the person's identity confirmed through a separate channel first (the script's own comment says this), and it's something I would only run with the CEO's go-ahead for that specific account, the same as any other production-touching action.

## 3. Rollout plan (proposed; nothing happens until approved)
1. **This release ships to production** (still blocked on the 17 Nov verification and the drill, per the agreed sequence).
2. **The CEO enrols his own Founder account first**, using the screen already built, once it's live.
3. Other `CEO_ADMIN`/`MANAGER`/`CTO` accounts enrol the same way, each confirmed done before the next step.
4. Only once every account in scope has enrolled, `REQUIRE_TWO_FACTOR_ROLES` is set (a configuration change on the server — needs the CEO's written approval, same as any production change) and sign-in without a code starts being refused for those roles.
5. The recovery script stays available for the rare case of a lost phone with no recovery codes left; each use is logged and reviewed, per the break-glass procedure in `21`.

## 4. What I need from the CEO
Nothing right now — this can wait for the 17 Nov update. When the time comes: his written approval to set `REQUIRE_TWO_FACTOR_ROLES` once everyone in scope has enrolled, and confirmation of exactly which roles should require it (my default suggestion: `CEO_ADMIN, MANAGER, CTO` — not `OPERATOR`, `CLIENT` or `HUNTER`, since those have no admin-level access to protect this way).
