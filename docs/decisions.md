# Architectural Decisions

## Stack: Next.js + PostgreSQL + Redis/BullMQ, not Chatwoot

Evaluated per spec section 37. Chatwoot's data model is built around inbox/agent support tickets, not around a server-authoritative per-conversation SLA timer with automatic reassignment, a billing ledger tied to message-level idempotency, or a pluggable AI-copilot-with-human-approval flow. Bending Chatwoot to those requirements would mean fighting its schema and conventions continuously - net more customization cost than building the (relatively small) core model this product actually needs. Not used.

## No microservices in V1

Message processing, AI processing, and outbound delivery are separate **queues and worker processes**, not separate deployable services with their own APIs. This gets the isolation/scaling benefit (each can scale independently, a crash in one doesn't take down another) without the operational cost of service-to-service auth, discovery, and versioning that a real client hasn't yet justified. Revisit if a single queue's throughput genuinely can't be handled by scaling worker concurrency/replicas.

## Airtable is not the source of truth

If an Airtable bridge is added, it is one-way (GCO -> Airtable) and driven by the `UsageRecord`/`Conversation` tables. Message counting, billing, and auditability all read from GCO's own Postgres ledger, never from Airtable. `AIRTABLE_ENABLED=false` by default.

## Assignment policy is intentionally simple in V1

`pickOperator` (`lib/assignment/policy.ts`) picks the AVAILABLE operator with the most spare capacity, ties broken by operator id. No skill-based routing, no idle-time tracking, no client-preference weighting. This is explicit per spec sections 35/36 ("do not build Phase 2/3 features prematurely") - the goal is a correct, race-safe, testable baseline first.

## AI never auto-sends

`lib/messages/send.ts::operatorSendMessage` is the only code path that creates an OUTBOUND `Message`. There is no code path, feature flag, or config value that lets an `AiGeneration` become an outbound send without going through this function, which requires an authenticated OPERATOR session per spec section 5/8/10.

## Built and verified without Docker/Homebrew

The original sandbox had no Node.js, npm, or Docker, and no package manager (no Homebrew, no sudo access to `/opt`). Rather than ship unverified code, a local toolchain was assembled without any system-level install: a portable Node.js tarball extracted to `.tools/node` (official nodejs.org binary, no installer), Redis compiled from source with the system's existing Xcode command-line-tools clang/make (`.tools/redis-src`), and PostgreSQL obtained by downloading and mounting the Postgres.app `.dmg` and copying out its self-contained binaries (`.tools/Postgres.app`) rather than installing it to `/Applications`. All three run as regular user processes with data directories under `.tools/`, nothing touched system paths. `.tools/` is gitignored - it's local dev scaffolding, not part of the shipped app; a real deployment uses `docker-compose.yml` (Postgres/Redis containers) as documented in `deployment.md`.

With that in place, the full stack was actually run: migrations applied, demo data seeded, `npm run typecheck`/`lint`/`build`/`test`/`test:integration` all executed and passed, and the complete message pipeline (webhook -> assignment -> AI suggestion -> operator UI -> send -> delivery -> usage ledger) was exercised end-to-end through both curl and a real browser. See `docs/mvp.md` for what was verified and the two real bugs this surfaced. Next.js was upgraded from the originally-chosen 14.2.15 to 16.3.3 during this process, after `npm install` flagged several critical CVEs in 14.x - the route-handler signature change that came with it (`params` is now a `Promise`) was fixed across all four dynamic routes.
