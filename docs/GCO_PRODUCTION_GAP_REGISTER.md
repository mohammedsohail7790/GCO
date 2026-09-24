# GCO — Production Gap Register

**Purpose.** A single, honest tracking table of everything standing between "application-side pilot-ready" and "production-validated." Every row states its status using the exact vocabulary VERIFIED / PARTIAL / MISSING / BLOCKED / NOT VERIFIED, cites the exact evidence behind that status, names the next action, and names who owns closing the gap (GCO engineering, the client, infrastructure/environment, or a business decision).

**Commit under audit:** `6ffc8d5`. **Do not inflate any status below without fresh, session-executed evidence** — this register must be updated (not silently re-asserted) the next time any of these are actually re-verified.

Governing skill: `gco-production-readiness` (`.claude/skills/gco-production-readiness/SKILL.md`).

---

| # | Item | STATUS | EVIDENCE | NEXT ACTION | OWNER |
|---|---|---|---|---|---|
| 1 | Real AI credential | **BLOCKED** | `.env` confirmed this session: `OPENAI_API_KEY` empty; `AI_PROVIDER` set but the OpenAI code path (`lib/ai/providers/openai.ts`) has never been executed against a live API in any environment this code has run in | Obtain a real `OPENAI_API_KEY` and re-run the AI pipeline against it before claiming real-provider behavior | CLIENT/DECISION (business must supply or approve a credential) |
| 2 | Real client integration | **BLOCKED** | `lib/integrations/registry.ts` registers only `DevMockAdapter`; no client API spec or sandbox exists in this repository or conversation | Complete `docs/GCO_CLIENT_DISCOVERY_PACKAGE.md` A–P once real documentation arrives | CLIENT (must supply spec/sandbox) |
| 3 | Docker build/run | **NOT VERIFIED / BLOCKED** | `command -v docker` fails in this environment (confirmed this session); `Dockerfile`/`docker-compose.yml` exist but have never been built or run anywhere this code has lived | Obtain a Docker-capable environment and run the first build | INFRA |
| 4 | CI execution | **NOT VERIFIED** | `.github/workflows/ci.yml` exists (confirmed via `git ls-files .github/`); no evidence obtainable from this repository that it has ever executed on GitHub's infrastructure | Trigger a real run on GitHub Actions and observe the result | INFRA |
| 5 | Backup/restore drill | **NOT VERIFIED** | `docs/deployment.md` documents a restore procedure and explicitly self-labels it "documented, NOT drilled/tested" | Perform an actual `pg_dump`/restore rehearsal before any real client data is at risk | INFRA |
| 6 | Load/soak testing | **NOT VERIFIED (at production topology)** | `docs/load-testing.md` records only short bursts (20–60s) at 100/500/1000 msgs/min historically; not re-run this session; no sustained/soak run has ever been performed | Re-run once real expected pilot/production volume is known (from client discovery §P) and on a production-matching topology | INFRA |
| 7 | Error tracking | **MISSING** | `SENTRY_DSN` confirmed empty in `.env` this session; zero `@sentry/*` dependency in `package.json`; zero code reference | Decide whether required before standing production; wire a provider if so | DECISION → GCO |
| 8 | Alerting | **MISSING** | No pager/notification integration found anywhere in the codebase; only pull-based `/api/v1/admin/system-health` exists | Decide whether required before standing production; build if so | DECISION → GCO |
| 9 | Secret management | **PARTIAL** | `.env` is gitignored, confirmed no secrets committed (`git ls-files` shows no `.env` variant tracked); `Integration.secretRef` schema field exists for referencing a secrets-manager entry, but no actual secrets-manager integration exists — secrets are `.env`-file-only today | Decide on a production secrets-manager before real client credentials are stored | INFRA/DECISION |
| 10 | Production deployment | **NOT VERIFIED** | Only direct-process deployment (`next build && next start` + worker + realtime-server) has ever run, and only in local/dev environments; no real hosting environment has ever run this code | Choose and execute a real deployment target | INFRA |
| 11 | Database migration process | **VERIFIED (mechanism, local)** | Fresh this session: `npx prisma migrate status` → "Database schema is up to date!", 3 migrations applied cleanly | Re-verify the same mechanism against a production-topology database before go-live | GCO |
| 12 | Redis failure/recovery | **NOT VERIFIED** | No fault-injection test exists; BullMQ's built-in reconnection behavior is architecturally relied upon but has never been directly observed under a real Redis outage in this codebase's history | Perform a fault-injection test (kill Redis mid-run, observe worker/queue behavior) before production scale | GCO/INFRA |
| 13 | Worker failure/recovery | **NOT VERIFIED** | BullMQ's ack-after-complete design is architecturally sound (jobs re-run on worker restart); no test has ever killed the worker process mid-job and observed the outcome | Perform a fault-injection test (kill `workers/index.ts` mid-job) | GCO |
| 14 | External API outage/retry behavior | **PARTIAL** | Generic retry exists uniformly for all 6 queues (`lib/queue/queues.ts::defaultJobOptions` — 5 attempts, exponential backoff from 2s) and is exercised end-to-end against the `dev-mock` adapter (E2E `09-dead-letter-recovery.spec.ts`, fresh-verified this session); no real external API has ever been the thing failing | Re-verify against a real client's actual outage/error behavior once an adapter exists | CLIENT/GCO |
| 15 | Data retention/privacy | **MISSING** | No retention/purge mechanism exists anywhere in the codebase; `Message`/`Conversation` rows persist indefinitely by default | Await any client-stated retention requirement (`docs/GCO_CLIENT_DISCOVERY_PACKAGE.md` §O) before building a purge mechanism | CLIENT/DECISION |
| 16 | Media support (if required) | **MISSING** | Confirmed by code read this session: `Message.content` is plain `@db.Text`; `NormalizedInboundMessage`/`OutboundSendRequest` carry only `content: string`; no attachment field anywhere in `prisma/schema.prisma` | Await client confirmation of need (`docs/GCO_CLIENT_DISCOVERY_PACKAGE.md` §I) before any schema/interface change; this would be a core-boundary change requiring explicit approval | CLIENT/DECISION → GCO (if approved) |
| 17 | Message-cap atomicity (if required) | **MISSING (soft ceiling only)** | Confirmed by code read this session: `lib/tenant/activity.ts::isMessageCapReached` performs `db.usageRecord.count()` at request time with no transactional slot reservation — a documented TOCTOU race under concurrent burst near the cap (see `docs/GCO_FINAL_V1_READINESS_AUDIT.md` §7/§20) | Only build an atomic version (reserve a slot in the same transaction as message/usage persistence) if a specific pilot/client explicitly requires burst-proof enforcement; otherwise set caps with headroom | DECISION → GCO (if approved) |

---

## Explicitly out of scope for this register (tracked elsewhere, not omitted by accident)

- Application-side functional readiness (RBAC, tenant isolation, core message pipeline, SLA, usage ledger) is tracked in the Final Readiness Table of the discovery brief and in `docs/GCO_FINAL_V1_READINESS_AUDIT.md` — those are already VERIFIED with fresh evidence and are not production-infrastructure gaps.
- Public website / operator recruitment site — explicitly FUTURE per `docs/GCO_PUBLIC_WEBSITE_ROADMAP.md`, not a production gap against the current V1 application.

## Update discipline

Do not change any row's STATUS without citing fresh, session-executed evidence in the EVIDENCE column. A prior session's finding remains valid only until someone actually re-checks it — cite the check, not the memory of a prior audit.
