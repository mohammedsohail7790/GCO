# Database

PostgreSQL via Prisma (`prisma/schema.prisma`) is the single source of truth. Airtable, if ever connected, is a one-way bridge into GCO - never authoritative (see [decisions.md](decisions.md)).

## Core entities

| Table | Purpose |
|---|---|
| `Tenant` | A client dating platform. Carries pricing/SLA/capacity defaults, overridable per operator/tenant. |
| `User` / `Session` | Login identity + RBAC role + refresh sessions. |
| `Operator` / `OperatorService` | Operator profile, capacity, and which tenants they're authorized to serve. |
| `Conversation` | One end-user thread on one tenant. State machine drives queue/assignment behavior. |
| `Message` / `MessageEvent` | Every inbound/outbound message plus an append-only lifecycle trace. |
| `Assignment` / `AssignmentHistoryEntry` | One operator's claim on a conversation, with a server-authoritative `respondsBy` deadline. |
| `AiGeneration` | Every AI suggestion, its metadata, and the operator's decision on it. |
| `AiMemory` | Extracted facts, each traceable to a source message, correctable/deletable. |
| `UsageRecord` | The billing ledger - one row per billable message, idempotency-keyed. |
| `Integration` / `WebhookEvent` | Per-tenant client integration config and every inbound webhook (deduped). |
| `AuditLog` / `SystemEvent` | Sensitive-action audit trail and infra-level events. |
| `Ticket` / `TicketHistoryEntry` | Client feedback/requests. |

## Tenant isolation

Every tenant-sensitive table carries `tenantId`, indexed. Enforcement is server-side only, in `lib/auth/tenantGuard.ts::resolveTenantScope` - a CLIENT session is always pinned to its own `tenantId` regardless of any tenantId supplied in the request. See [security.md](security.md).

## Race-safety

- **Double assignment**: `Conversation.currentAssignmentId` is unique; `tryAssignConversation` uses a conditional `updateMany(... WHERE currentAssignmentId IS NULL)` inside a transaction, so only one concurrent caller can win.
- **Double billing**: `UsageRecord.messageId` is unique; `recordMessageUsage` checks-then-creates and falls back to reading the existing row on a unique-constraint race.
- **Duplicate messages**: `Message` has a unique constraint on `(tenantId, externalMessageId, direction)`.
- **Duplicate webhooks**: `WebhookEvent` has a unique constraint on `(integrationId, externalEventId)`.

## Migrations

```bash
npx prisma migrate dev      # local development
npx prisma migrate deploy   # production
```
