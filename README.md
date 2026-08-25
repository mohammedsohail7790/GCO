# GCO - Conversation Operations Platform

Multi-tenant, API-driven platform connecting international dating apps to human conversation operators, with an AI copilot that suggests replies for human review (never auto-sends in V1).

**Status**: production-hardened V1, first-client-ready. 61 automated tests (25 unit, 4 integration, 32 E2E) all passing, plus manual load testing at 100/500/1000 msgs/min and realtime push verified in a real browser. See [docs/production-readiness.md](docs/production-readiness.md) for the authoritative current status (VERIFIED vs. IMPLEMENTED BUT NOT VERIFIED vs. BLOCKED vs. NOT YET BUILT), [docs/production-readiness-audit.md](docs/production-readiness-audit.md) for the detailed findings/fixes log, and [docs/client-integration-checklist.md](docs/client-integration-checklist.md) for exactly what's needed to connect the first real client.

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
npx tsx workers/realtime-server.ts   # in another terminal - realtime push for the dashboards
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
# with the app + worker + postgres + redis running:
npm run test:e2e         # 32 real E2E tests against the live API - see docs/testing.md
```

## Docs

- [production-readiness.md](docs/production-readiness.md) - **start here** - authoritative current status
- [production-readiness-audit.md](docs/production-readiness-audit.md) - detailed findings/fixes log
- [client-integration-checklist.md](docs/client-integration-checklist.md) - what's needed to connect a real client
- [architecture.md](docs/architecture.md) - system diagram, process boundaries
- [database.md](docs/database.md) - schema, race-safety, tenant isolation
- [api.md](docs/api.md) - endpoint reference
- [ai.md](docs/ai.md) - provider abstraction, structured output, fallback
- [queue.md](docs/queue.md) - BullMQ setup, idempotency, dead-letter
- [security.md](docs/security.md) - authn/authz, tenant isolation, secrets
- [deployment.md](docs/deployment.md) - Docker, health checks, operational assumptions
- [testing.md](docs/testing.md) - the four test layers and how to run them
- [load-testing.md](docs/load-testing.md) - method, measured results, caveats
- [operations.md](docs/operations.md) - tracing a message, QC workflow
- [recovery.md](docs/recovery.md) - emergency recovery actions
- [mvp.md](docs/mvp.md) - V1 checklist and gaps
- [decisions.md](docs/decisions.md) - why things were built this way
