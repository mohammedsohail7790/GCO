# 26 — Verifying privileged accounts and the recovery procedure before mandatory two-factor

**Status:** a checklist. Mandatory two-factor is **not enabled anywhere**. The setting `REQUIRE_TWO_FACTOR_ROLES` stays off until the CEO approves, after everything below is verified.

## 1. Why this order matters
Two-factor enrolment needs a signed-in session. If the setting is turned on while an account has no two-factor, that person cannot sign in or enrol. Rotating `AUTH_SECRET` also makes every stored two-factor seed unreadable, so everyone must re-enrol.

## 2. Step 1: list the privileged accounts
Roles to consider: `CEO_ADMIN`, `ASSISTANT`, `MANAGER`, `CTO` (and `SUPERVISOR` if the CEO wants it). Fill in this table from the production admin screen (users list).
| Person | Role | Active? | Two-factor on? (the person checks **Account → Two-factor**) | Recovery codes saved? | Verified by |
|---|---|---|---|---|---|
| [CEO] | CEO_ADMIN | | | | |
| [CTO] | CTO | | | | |
| [others] | | | | | |
**Gap:** the admin users list does not show two-factor status. Each person confirms their own status on the Account page (read-only). If the CEO wants a central view, a small read-only status column is possible later (a code change, not made).

## 3. Step 2: enrol and prove it works (each person, on staging first, then production)
1. Account → Two-factor → enter the password → add the setup key to an authenticator app → confirm with the first code.
2. **Save the 10 recovery codes offline** (printed or in a password manager), shown once.
3. Sign out and sign in again with a code. Then sign in once with a recovery code on **staging** to prove they work (that code is then used up; generate a new set).
4. Record the date. Never share a code in chat or email.

## 4. Step 3: the recovery procedure (written, then tested on staging)
| Situation | Action | Who | Evidence |
|---|---|---|---|
| Lost phone, has recovery codes | sign in with a recovery code, then Account → set up a new device and new codes | the person | audit entry `auth.2fa_recovery_code_used` |
| Lost phone **and** codes | After confirming the person's identity by a second channel, the CTO runs `prisma/ops/reset-2fa.ts --email <address>` **on the server** (it asks you to type `reset`, never prints a secret, and writes an audit entry `auth.2fa_reset_by_operator`). This is a production shell action, so it follows the **break-glass procedure** (`21`): the CEO approves first, and the CTO's own account is reset by the CEO's approval and another person's presence. | CTO with CEO approval | access log + audit entry |
| **CEO locked out** and the CTO unavailable | The EU delegate or the CEO (whoever holds break-glass) runs the same tool. If nobody can: provider-level rebuild from backup (needs the backup keys, `20`). | break-glass holder | recorded |
| Both the CEO and the CTO accounts locked | Keep **one** privileged account out of the enforced list for a short, recorded period, or use break-glass directly | CEO decides | recorded |
**Test on staging before production:** (a) enrol a test CEO account, (b) sign in with a recovery code, (c) run `reset-2fa.ts` against the staging account, (d) turn on `REQUIRE_TWO_FACTOR_ROLES=CEO_ADMIN` on staging and confirm that an enrolled account signs in and an un-enrolled account is refused with `TWO_FACTOR_ENROLMENT_REQUIRED`, then (e) turn it off again.

## 5. Step 4: only then
1. CEO reviews the table above (all rows verified) and the staging test results.
2. CEO approves, in writing, the roles list and the date.
3. CTO sets `REQUIRE_TWO_FACTOR_ROLES` for production (a configuration change and a restart: a planned window, with break-glass ready), and checks the privileged sign-ins immediately.
4. **Rollback:** unset the variable and restart; nothing else is changed.

## 6. Do not
Do not rotate `AUTH_SECRET` while enforcement is on unless everyone is ready to re-enrol. Do not enable the setting before the table is complete. Do not skip the staging test of the recovery tool.

## 7. Rehearsal result, 31 Oct 2026 (local copy with fictional data; **not** the staging server, nothing on production)
A second web instance with `REQUIRE_TWO_FACTOR_ROLES=CEO_ADMIN,MANAGER` was run against the local demo database next to a normal instance:
| Check | Result |
|---|---|
| Enrol the demo founder account on the normal instance (password, authenticator code) | works; 10 recovery codes issued |
| Enforced instance: manager (listed role, not enrolled), correct password | refused, `403 TWO_FACTOR_ENROLMENT_REQUIRED` |
| Enforced instance: operator (role not listed) | signs in normally |
| Enforced instance: enrolled founder, password only | asked for the code (`401 TWO_FACTOR_REQUIRED`) |
| Enforced instance: wrong code | refused |
| Enforced instance: correct code | signs in |
| Enforced instance: recovery code | signs in |
| Same recovery code used again | refused (single use) |
| Turn two-factor off again (password plus signed-in session) | works |
**Not exercised here:** `prisma/ops/reset-2fa.ts` (it needs an interactive terminal and a typed `reset`; the CTO runs it on staging); a run on the real staging server; the existing automated tests do not cover the enforced-sign-in path over HTTP (only the policy function), so a regression test for it is worth adding.
**Two findings for the production plan:** (1) a listed account without two-factor is refused at sign-in **even with the right password and cannot enrol alone**, so the CEO must enrol **before** enforcement is switched on (this is why the order in sections 3 to 5 matters); (2) production currently has **no CTO account** (only the founder and a hunter account on the company domain), so "mandatory for Founder and CTO" requires first creating a CTO staff account with `prisma/ops/staff-account.ts --role CTO`, enrolling it, and only then enforcing.
