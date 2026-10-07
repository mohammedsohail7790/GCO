# Credential remediation: retiring the published-password demo accounts

## Finding (2026-10-08)
Production held exactly five accounts - `admin@demo.gco` (CEO_ADMIN), `manager@demo.gco`, `hunter1@demo.gco`, `operator1@demo.gco`, `client@demo.gco` - created by `prisma/seed.ts` on 2026-09-28, **all still accepting the seed password published in the repository, docs and tests**. No one had signed in since 2026-09-28; 5 unexpired refresh sessions from that day existed. Because the CEO demo account could sign in with a published password, anyone with that password could act as CEO. Verified by offline hash comparison inside the container (no login attempts); no hashes were printed.

## What changed in the code (no data was changed by this commit)
- `lib/auth/password.ts` - the application's hashing (bcrypt cost 12) and the staff password policy (>= 12 chars, <= 72 bytes, not the published password, not common, not containing the email name).
- `lib/auth/staffAccounts.ts` + `prisma/ops/staff-account.ts` - create a real CEO_ADMIN / ASSISTANT / HUNTER account, or rotate a password. **The password is only ever typed at a hidden prompt** (echo is disabled before the prompt is printed): never an argument (any password-like flag is refused), never an environment variable, never a pipe (it refuses to run without a terminal), never printed or logged; only a bcrypt hash is stored. Refuses demo emails, tenant/client accounts, role changes (unless `--allow-role-change`) and re-creating an existing account (unless `--update-password`). A password rotation revokes every older session. `--dry-run` validates and changes nothing, asking for no password. A production process shows a banner and requires typing `production`.
- `prisma/ops/disable-demo-accounts.ts` - disables (never deletes) the five demo accounts and revokes their sessions, pinned by **immutable user id + email + role + tenant**. It refuses unless all five match exactly, no other `@demo.gco` account exists, and a **verified real CEO_ADMIN exists** (active, non-demo, hash is not the seed password). Default mode is report-only; `--execute` needs a terminal and a typed confirmation. Idempotent; the demo tenant, data and history are untouched; the audit trail stores no credentials.
- `prisma/seedGuard.ts` - `prisma/seed.ts` now refuses to run when `NODE_ENV=production` (both production containers) unless `GCO_ALLOW_DEMO_SEED=yes-this-is-staging-not-production`. Nothing in startup or deployment runs the seed, so it could only have been re-run by hand; now a stray run cannot recreate the accounts. Local development and CI (not production-mode) are unaffected; the staging doc was updated.

## Cristian's procedure (on the production server; he types his own password)
1. Create the real CEO login - he is prompted for his email, name and password (hidden, twice):
```bash
ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/staff-account.ts --role CEO_ADMIN'
```
2. Create the Hunter login the same way (the Hunter, or Cristian for a separate selling login, chooses that password privately):
```bash
ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/staff-account.ts --role HUNTER'
```
3. Sign in once with the new CEO login in the browser to confirm it works.
4. Report what would be disabled (changes nothing), then retire the demo accounts:
```bash
ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/disable-demo-accounts.ts'
ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/disable-demo-accounts.ts --execute'
```
The `--execute` run refuses if step 1 was not done. Never paste a password into chat, a ticket or a shell command.

## Caveats
- Access tokens are stateless 60-minute JWTs: disabling an account refuses new sign-ins and token refreshes immediately, but a token minted in the previous hour stays valid until it expires. At the time of writing no session had been used since 2026-09-28, so none is live.
- After the demo accounts are disabled the demo tenant remains but nobody can sign in as its demo users; local/CI fixtures are unaffected.

## Rollback
Re-enable a demo account: `update "User" set "isActive" = true where id = '<id>'` (ids are in `DEMO_ACCOUNTS`, `lib/auth/staffAccounts.ts`) - **only for a deliberate reason, since it restores the published password**. A created real account can be disabled the same way. The code change is rolled back by retagging the `pre-credential-fix` images.

## Assessment: staff password change / reset / forced rotation (not built)
- **Staff change password (signed in):** small. A `POST /auth/change-password` (current + new password, `validateStaffPassword`, `hashPassword`, revoke other sessions) plus a form. Low risk; the main work is the form and rate limiting.
- **Forgot / reset:** needs a delivery channel. GCO has **no outbound email**, so a reset link cannot be sent; the practical interim is the CEO-run `staff-account.ts --update-password` on the server. A real reset flow needs an email provider decision.
- **Forced rotation / first-login change:** needs a `mustChangePassword` flag (an additive migration), login and middleware handling, and the change-password endpoint above.
- **Stateless-token gap:** `getSession` does not check `isActive`/revocation, so access tokens outlive a disable by up to 60 minutes; closing it means a per-request user check (one indexed read) or shorter token lifetime.
Recommended order: change-password endpoint + form, then the `isActive` check on requests, then forced rotation; reset waits on an email provider.
