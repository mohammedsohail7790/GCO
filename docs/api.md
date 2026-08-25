# API

Base path: `/api/v1`. All responses: `{ ok: true, data, meta? }` or `{ ok: false, error: { message, code? } }`.

Auth: HTTP-only cookie `gco_at` (access token, JWT, short TTL) set by `/auth/login`; refresh via `gco_rt` cookie + `/auth/refresh`. API clients (server-to-server) may instead send `Authorization: Bearer <token>`.

## Endpoints (V1)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/login` | - | Email/password login, sets cookies |
| POST | `/auth/refresh` | refresh cookie | Rotate access token |
| POST | `/auth/logout` | session | Revoke session |
| GET | `/auth/me` | session | Current user |
| POST | `/webhooks/:integrationId` | HMAC signature | Inbound client message webhook |
| GET | `/conversations` | MANAGER/CEO_ADMIN/CLIENT | List, tenant-scoped, filterable by state |
| GET | `/operators/me/workspace` | OPERATOR | Active + queued conversation with full context |
| PATCH | `/operators/me/status` | OPERATOR | Set AVAILABLE/BUSY/PAUSED/OFFLINE |
| GET | `/operators` | MANAGER/CEO_ADMIN | Operator roster + live load |
| GET | `/conversations/:id/suggestion` | session | Latest AI suggestion (safe metadata only) |
| POST | `/messages/send` | OPERATOR | Send the reviewed/edited reply |
| POST | `/assignments/:id/reassign` | MANAGER/ASSISTANT/CEO_ADMIN | Manual reassignment |
| GET/POST | `/tickets` | CLIENT (own) / staff | Feedback & requests |
| PATCH | `/tickets/:id` | staff | Update ticket status/priority/assignee |
| GET | `/usage/summary` | session (tenant-scoped) | Billing summary from the usage ledger |
| GET | `/analytics/overview` | MANAGER/CEO_ADMIN/CLIENT | Live operational counts |
| GET/POST | `/admin/tenants` | CEO_ADMIN | Tenant management |
| POST | `/admin/users` | CEO_ADMIN | Create staff/operator/client users |
| GET | `/admin/system-health` | MANAGER/CEO_ADMIN/ASSISTANT | DB/Redis/queue health, recent errors |
| POST | `/admin/recovery/requeue-dead-letter` | CEO_ADMIN/ASSISTANT | Emergency recovery action, audited |
| GET | `/admin/audit-logs` | CEO_ADMIN | Audit trail |
| GET | `/health` | - | Liveness/readiness for orchestrators |

## Conventions

- Pagination: `?page=1&pageSize=25` (capped at 100-200 depending on endpoint), response includes `meta: { total, page, pageSize }`.
- Every error carries an HTTP status derived from the thrown error's `.status` (401 unauthenticated, 403 forbidden, 404 not found, 400 validation, 429 rate limited, 500 unexpected).
- Tenant scoping: pass `?tenantId=` for CEO_ADMIN/staff to target a specific tenant; CLIENT sessions ignore this and are always pinned server-side to their own tenant.
