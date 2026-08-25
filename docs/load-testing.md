# Load Testing

## Method

`scripts/loadtest.ts` (`npm run loadtest -- <messagesPerMinute> <durationSeconds>`) sends real, individually-signed webhook requests to a running instance at a fixed interval, then polls the database until every message is persisted (or a 30s timeout), reporting measured webhook ack latency percentiles and end-to-end drain time. Not a synthetic/mocked benchmark - it exercises the full path: HTTP -> signature verification -> dedup check -> DB write -> BullMQ enqueue -> worker processing -> DB write.

## Environment this was measured on

**Important caveat**: these numbers come from a single laptop running Next.js dev server, one BullMQ worker process, PostgreSQL, and Redis all on localhost with no network hop, no TLS termination, no load balancer, and the mock AI provider (zero external latency). This tells you the application-layer pipeline has no obvious bottleneck at these volumes - it does **not** tell you what a production deployment with real infrastructure and a real AI provider will do. Re-run this against a staging environment that matches production topology before trusting these numbers for capacity planning.

## Results (2026-08-25)

| Tier | Messages | Persisted | Webhook ack p50 | p95 | p99 | max | Queue drain after last send |
|---|---|---|---|---|---|---|---|
| 100 msgs/min | 100 | 100/100 | 13ms | 17ms | 29ms | 29ms | 2ms |
| 500 msgs/min | 250 | 250/250 | 8ms | 14ms | 19ms | 35ms | 2ms |
| 1000 msgs/min | 333 | 333/333 | 8ms | 11ms | 17ms | 28ms | 3ms |

At all three tiers requested (100/500/1000 msgs/min), 100% of messages were persisted with no measurable queue backlog - the worker keeps up with ingestion in real time on this hardware. Webhook acknowledgment latency stays under 30ms even at the top tier, well within the "return fast" requirement (spec section 18).

## A real bug this testing caught

The first 1000/min run failed at 290/333 messages with HTTP 429 - not a pipeline failure, but the **webhook rate limiter I had just added** (`lib/api/rateLimit.ts`) was set to 300 requests/minute per integration, which is *below* the volume tier the business itself wants to support. Fixed by raising the limit to 3000/min (see the code comment in `rateLimit.ts` for the reasoning) and re-running - see the corrected 1000/min row above. This is exactly the kind of thing load testing is supposed to catch before it reaches a real client: a well-intentioned security control that would have silently rejected a fifth of a real customer's legitimate traffic at their stated peak volume.

## What wasn't tested here

- **Sustained load over minutes/hours** (these runs are 20-60 seconds) - not validated for memory leaks, connection pool exhaustion, or Redis memory growth over a longer window.
- **True concurrent burst** (many requests with zero spacing, hitting the server simultaneously rather than one every N ms) - the current script sends sequentially with a fixed interval, which resembles real traffic better than a thundering-herd burst but doesn't stress-test connection-pool concurrency limits.
- **Multiple operators / concurrent assignment races** at scale (10, 50, 100 operators - spec section "operator load test") - `tests/e2e/03-operator-capacity.spec.ts` proves correctness with 1 operator/capacity 2; race-safety under high concurrent operator counts is architecturally covered by the transactional conditional-update in `lib/assignment/engine.ts` (see `docs/database.md`) but has not been load-tested with many simultaneous operators.
- **Real AI provider latency** under load - only the zero-latency mock provider was used; OpenAI's actual response time (typically 500ms-3s) will materially change the AI-suggestion queue's throughput characteristics and needs separate measurement once a real API key is available (see `docs/ai.md`).
- **Network-realistic conditions** - see the caveat above.

## Recommended next load-testing step

Before onboarding a real client at meaningful volume: run this same script (or a proper load-testing tool like k6/Artillery, which this simple script is not a substitute for at real scale) against a staging deployment that matches production infrastructure, sustained for at least 10-15 minutes at the client's expected peak rate, with the real AI provider enabled.
