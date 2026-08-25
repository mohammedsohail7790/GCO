# Operations

## "Why wasn't this message answered?"

1. Find the `Message` row, read its `MessageEvent` history (ordered): `INGESTED -> QUEUED -> ASSIGNED -> AI_SUGGESTED -> ...`. The last event tells you where it stalled.
2. If it stopped at `QUEUED`: check `Conversation.state` and whether any `Operator` was `AVAILABLE` with spare capacity at that time (`Operator.status`, `Assignment` rows). No eligible operator is the most common cause.
3. If an `Assignment` exists: check `status` (`ACTIVE`/`EXPIRED`/`COMPLETED`/`CANCELLED`) and `respondsBy` vs `respondedAt`/`expiredAt`.
4. Check `AssignmentHistoryEntry` for the full reassignment chain.
5. Check `AiGeneration.status` - if `failed`, the AI was down but the operator should still have been able to respond manually; check whether the operator was even assigned (step 2).

## Manager quality control workflow

Manager Panel -> Operators -> select operator -> their conversations -> per-conversation: incoming messages, AI suggestion, final response, response time, reassignment history. Backed by `GET /operators`, `GET /conversations?tenantId=`, and the message/assignment history endpoints.

## Manual reassignment

`POST /assignments/:id/reassign { reason }` (MANAGER/ASSISTANT/CEO_ADMIN). Cancels the current active assignment, requeues the conversation, and attempts immediate reassignment. Always creates an `AssignmentHistoryEntry` and an `AuditLog` entry.

## Monitoring day-to-day

- `GET /api/v1/admin/system-health` - DB/Redis up, per-queue waiting/active/delayed/failed/completed counts, recent error `SystemEvent`s.
- Dead-letter queue depth (`queues.deadLetter.waiting`) should be near zero; a nonzero value means jobs exhausted retries and need manual review (`docs/recovery.md`).
