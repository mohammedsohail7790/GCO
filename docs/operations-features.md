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
- Not built: two-factor sign-in, emailed password reset, forced rotation.

## Not built (and why)
- Email notifications: no email provider configured; needs an owner decision (see `docs/careers-applications.md`).
- Real client integration and billing: need the first client's platform details.
