# Queue

BullMQ on Redis (`lib/queue/queues.ts`). Six queues:

| Queue | Producer | Consumer | Purpose |
|---|---|---|---|
| `message-ingest` | webhook route | `workers/processors/ingest.ts` | Normalize + persist inbound messages |
| `ai-suggestion` | ingest pipeline | `workers/processors/aiSuggestion.ts` | Generate the copilot suggestion |
| `memory-extraction` | ingest pipeline | `workers/processors/memoryExtraction.ts` | Extract facts asynchronously |
| `outbound-delivery` | operator send | `workers/processors/outboundDelivery.ts` | Deliver the reply to the client platform |
| `assignment-timeout` | assignment engine | `workers/processors/assignmentTimeout.ts` | Enforce the server-side SLA deadline |
| `analytics` | various | `workers/processors/analytics.ts` | Non-blocking event logging |
| `dead-letter` | worker failure handler | admin recovery console | Jobs that exhausted retries |

## Idempotency

Every producer uses a deterministic `jobId` derived from the domain key (e.g. `suggest:${messageId}`), so re-enqueuing the same logical unit of work is a no-op rather than a duplicate job.

## Retry & dead-letter

Default job options: 5 attempts, exponential backoff starting at 2s. When a job exhausts its attempts, `workers/index.ts`'s `failed` listener moves it into the `dead-letter` queue with the original queue/name/data/error, and logs a `SystemEvent`. An authorized user (CEO_ADMIN/ASSISTANT) can inspect and requeue it via `POST /admin/recovery/requeue-dead-letter` - always audited.

## SLA timers

`scheduleAssignmentTimeoutCheck` adds a delayed job (`delay = respondsBy - now`) to `assignment-timeout`. The processor calls `expireAssignment`, which is idempotent (no-ops if the assignment is no longer `ACTIVE`) - safe to run more than once, e.g. after a worker restart. Because the deadline lives in `Assignment.respondsBy` (persisted, server-computed at assignment time) rather than in browser state, a page refresh or operator reconnect never resets or loses the timer.

## Sweep

`workers/index.ts` runs a 15s sweep over `QUEUED`/`REASSIGNING` conversations with no current assignment, retrying `tryAssignConversation`. This catches conversations left unassigned because no operator was free at the moment of ingestion/expiry.

## Why not in-memory queues

An in-memory array queue dies with the process - a worker crash or deploy would silently lose in-flight conversations. Redis-backed BullMQ persists jobs and survives process restarts, which the spec explicitly requires (section 20/61).
