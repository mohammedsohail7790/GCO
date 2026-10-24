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
