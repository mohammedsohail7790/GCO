# GCO - Conversation Operations Platform

Multi-tenant, API-driven platform connecting international dating apps to human conversation operators, with an AI copilot that suggests replies for human review (never auto-sends in V1).

**Status**: V1 core pipeline implemented AND verified end-to-end (typecheck/lint/build/tests all pass; the full message pipeline - webhook -> assignment -> AI suggestion -> operator UI -> send -> delivery -> usage ledger - was walked through manually against real Postgres/Redis, including a real browser session). See [docs/mvp.md](docs/mvp.md) for exactly what was verified and the known gaps, and [docs/decisions.md](docs/decisions.md) for how (no Docker/Homebrew were available, so a local toolchain was assembled without touching system paths).

## Quick start

```bash
cp .env.example .env
# edit .env: set AUTH_SECRET (openssl rand -base64 48)

docker compose up -d postgres redis
npm install
npx prisma generate
npm run prisma:migrate
npm run seed

npm run dev            # web app -> http://localhost:3000
npm run worker:dev     # in another terminal
npx tsx workers/realtime-server.ts   # in another terminal
```

Seeded demo logins (password `DemoPassword123!`):
- `admin@demo.gco` - CEO_ADMIN
- `manager@demo.gco` - MANAGER
- `operator1@demo.gco` - OPERATOR
- `client@demo.gco` - CLIENT

## Sending a test message

```bash
# Get the integration id from the seed script output, then:
curl -X POST http://localhost:3000/api/v1/webhooks/<integrationId> \
  -H "Content-Type: application/json" \
  -H "X-GCO-Signature: $(echo -n '{"events":[{"event_id":"e1","message_id":"m1","user_id":"u1","text":"Hi there"}]}' | openssl dgst -sha256 -hmac "$DEV_WEBHOOK_SECRET" | cut -d' ' -f2)" \
  -d '{"events":[{"event_id":"e1","message_id":"m1","user_id":"u1","text":"Hi there"}]}'
```

## Verifying (do this before trusting the build)

```bash
npm run typecheck
npm run lint
npm test                 # unit tests (assignment policy, RBAC, tenant isolation)
npm run test:integration # requires Postgres running (see above)
npm run build
```

## Docs

- [architecture.md](docs/architecture.md) - system diagram, process boundaries
- [database.md](docs/database.md) - schema, race-safety, tenant isolation
- [api.md](docs/api.md) - endpoint reference
- [ai.md](docs/ai.md) - provider abstraction, structured output, fallback
- [queue.md](docs/queue.md) - BullMQ setup, idempotency, dead-letter
- [security.md](docs/security.md) - authn/authz, tenant isolation, secrets
- [deployment.md](docs/deployment.md) - Docker, health checks, operational assumptions
- [operations.md](docs/operations.md) - tracing a message, QC workflow
- [recovery.md](docs/recovery.md) - emergency recovery actions
- [mvp.md](docs/mvp.md) - V1 checklist and gaps
- [decisions.md](docs/decisions.md) - why things were built this way
