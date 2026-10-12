# Operations features (conversation lifecycle, history, alerts, client reports, service settings, account)

Status: built and tested locally; **not deployed to production** (see `docs/deployment-plan-operations.md`).

## Conversation lifecycle
- `POST /api/v1/conversations/:id/resolve` - OPERATOR (own/assigned conversation only), MANAGER, CEO_ADMIN, ASSISTANT. Closes the
  conversation, completes its assignment (frees capacity), audits `conversation.resolved`. Refused (409) while an escalation is
  unresolved or the conversation is already closed. Another tenant's conversation is a 404.
- `POST /api/v1/conversations/:id/reopen` - MANAGER, CEO_ADMIN, ASSISTANT. CLOSED -> QUEUED, assigned like any queued conversation.
- `POST /api/v1/conversations/:id/notes` - internal note (<= 2000 chars); operators only on conversations they are working on.
  Notes are internal and never shown to the client. Audit entries carry ids only.
- A new customer message after a conversation is closed starts a new conversation (existing ingestion rule).

## History
- `GET /api/v1/conversations/search?q=&state=&language=&page=&pageSize=` and `GET /api/v1/conversations/:id/transcript` -
  MANAGER, CEO_ADMIN, ASSISTANT; tenant-scoped; never cached. Shown on the manager dashboard ("Conversation history").

## Alerts (in-app only - no email)
- `GET /api/v1/ops/alerts` computes alerts from live data: no available operator, language with waiting conversations and no
  covering operator, conversations waiting > 5 min, response deadline passed / within 60 s, unclaimed escalations (> 15 min),
  SLA-capped conversations, quality-review backlog. Outside the tenant's operating hours "no operator" is downgraded to info.

## Client reports
- `GET /api/v1/reports/client?days=` (1-90): conversations per day, totals, average first response, % answered within deadline,
  average quality scores, languages. CLIENT is pinned to its own tenant; no operator names, notes or QA comments are returned.

## Service settings
- `GET/PATCH /api/v1/tenant/settings`: response deadline (30-3600 s), default operator capacity (1-20), IANA timezone, weekly
  operating hours. View: CEO, assistant, manager, client. Change: CEO and assistant only; audited (`tenant.settings_changed`,
  old -> new values). Operating hours are informational (alerts); they never block routing. Migration `*_tenant_operating_hours` is additive.

## Account
- `/account` (all roles) and `POST /api/v1/auth/change-password`: needs the current password, applies the staff password policy,
  signs out the user's other sessions, rate-limited (5 per 15 min), audited without any password.
- Two-factor sign-in: optional, see below. Not built: emailed password reset, forced rotation.

## Not built (and why)
- Email notifications: no email provider configured; needs an owner decision (see `docs/careers-applications.md`).
- Real client integration and billing: need the first client's platform details.

## Staff invitations (client onboarding)
- `POST /api/v1/admin/staff-invitations` (CEO/assistant) creates an INACTIVE OPERATOR or MANAGER for an ACTIVE client (never the demo
  client) with an unusable password and returns a one-time setup link ONCE. `GET ...?tenantId=` lists staff and invitation states;
  `POST .../:id/reissue` replaces the link; `POST .../:id/cancel` withdraws an unused one.
- `/accept-invitation#token=...` (same page as the client flow): the person chooses their own password under the staff policy (a weak
  password is refused without using up the link); the token is single-use, expires in 7 days, only its SHA-256 is stored, failures are
  one generic 400. Operators are created OFFLINE with the client's default capacity and the languages given.
- Table `StaffInvitation` (additive migration `*_staff_invitations`).

### Deployment record - staff invitations (2026-10-12, owner-approved)
- Gate on the deployed code: lint/tsc clean; unit 424/424; integration 165/165; build clean; e2e 255/255.
- Backup `gco-postgres-20261012T065354Z.dump` (898,225 bytes), B2 upload verified (sha1 7378021d...).
- Server HEAD `d9af8dc`; `deliverables/` not sent. Rollback tags `gco-web:pre-onboarding`, `gco-worker:pre-onboarding`.
- Migration `20261012064540_staff_invitations` applied (15 total); only web and worker recreated.
- Post-deploy (read-only): web healthy, worker up, 0 log errors; `StaffInvitation` has 0 rows; users unchanged (7, 2 active: real CEO and Hunter);
  pages 200; the four invitation endpoints return 401 to an anonymous caller; a bogus invitation token returns the generic 400.
  No production data was created.

## Two-factor sign-in (optional, per account)

Any signed-in user can turn on authenticator-app (TOTP, RFC 6238: SHA-1, 6 digits, 30 s) sign-in from **Your account → Two-factor sign-in**. It is **not forced on anyone**; it is strongly recommended for the CEO account and any CEO_ADMIN/ASSISTANT.

- **Enrol:** enter the current password → a setup key is shown (type it into Google Authenticator, 1Password, Authy…; no QR image is generated, so no extra dependency) → confirm with the first 6-digit code and the password → ten single-use **recovery codes** are shown once. Nothing is enforced until that first code is confirmed.
- **Sign in:** the password is checked first; only a correct password gets asked for the code (`401 TWO_FACTOR_REQUIRED`, no cookies set). A code is accepted within ±1 step and **only once** (the step is claimed atomically; concurrent submissions of the same code cannot both succeed). A recovery code can be typed in its place and is removed when used. Wrong codes are audited (`auth.2fa_failed`) and rate-limited (10 per 15 min per account, on top of the login limiter).
- **Change anything** (set up, turn off, new recovery codes) requires the current password again, so a stolen session alone cannot disable it.
- **Storage:** the seed is encrypted (AES-256-GCM, key derived with HKDF from `AUTH_SECRET`); recovery codes are stored only as SHA-256 hashes. Audit entries hold ids only. **Rotating `AUTH_SECRET` makes stored seeds undecryptable** - affected people would need an operator reset (below) and to enrol again.
- **Lost phone and recovery codes:** after confirming the person's identity by another channel, run on the server (interactive, asks you to type `reset`):
  `ssh -t gco@<server> 'cd /opt/gco && docker compose exec worker npx tsx prisma/ops/reset-2fa.ts --email someone@example.com'`
  It turns two-factor off and signs that account out everywhere; they set it up again themselves.
- Migration `20261012065733_two_factor` is additive (four nullable/defaulted columns on `User`).
