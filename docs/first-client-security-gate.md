# First Client Security Gate

Before any real customer data enters GCO for a given client, every item below must be checked - honestly, against what's actually verified, not what's merely built. If any **mandatory** item fails, the client is **NOT READY** and real data must not be entered until it's fixed.

Status as of Phase 10 (production commit `6af6081`), re-verify per-client at provisioning time:

## Infrastructure

| Item | Status |
|---|---|
| HTTPS | ✅ VERIFIED (Let's Encrypt via Caddy, auto-renewing) |
| Firewall (UFW) | ✅ VERIFIED (only 22/80/443 public) |
| fail2ban | ✅ VERIFIED (active, banning malicious SSH attempts) |
| Private database (PostgreSQL) | ✅ VERIFIED (no public port, Docker-internal only) |
| Private Redis | ✅ VERIFIED (no public port, Docker-internal only) |
| Docker API private | ✅ VERIFIED (no 2375/2376 listener) |
| SSH key-only | ✅ VERIFIED (password auth disabled) |

## Application

| Item | Status |
|---|---|
| RBAC | ✅ VERIFIED (Phase 6, re-spot-checked Phase 7/9) |
| Tenant isolation | ✅ VERIFIED mechanism (Phase 6, multi-tenant concurrent test); ⚠️ only one tenant currently exists in production, so there is nothing to cross-check live right now - **re-verify explicitly once a second (real client) tenant exists**, per `docs/pilot-acceptance-checklist.md` |
| Authentication | ✅ VERIFIED (login/logout/session, public HTTPS domain) |
| Secure cookies | ✅ VERIFIED (Secure + HttpOnly + SameSite=Strict, confirmed over real HTTPS) |
| Webhook authentication | ✅ VERIFIED (per-integration HMAC secret, fails closed if unset) |
| Duplicate protection | ✅ VERIFIED (webhook event dedup, DB-constraint-backed idempotency on commission/approval) |
| Idempotency | ✅ VERIFIED (claim/approval/payment-confirmation all race-safe, tested under real concurrency in Phase 6) |

## Data

| Item | Status |
|---|---|
| Client tenant isolation | See Application row above - mechanism proven, needs live re-check once a second tenant exists |
| No demo data crossover | ✅ VERIFIED (Phase 10 Section 2 audit: demo data scoped to exactly one tenant, no stray rows) |
| Backup exists | ✅ VERIFIED (automated daily, `docs/recovery-runbook.md`) |
| Restore path verified | ✅ VERIFIED (Phase 8: restored into an isolated target, confirmed schema/data, production untouched) |
| Offsite backup | ❌ **NOT CONFIGURED** - backups are local to the primary server only. Owner action required before this can be marked ready for a client whose data-loss tolerance requires geographic redundancy. |
| Retention requirements understood | Depends entirely on the specific client - capture during discovery (`docs/client-technical-discovery.md`), not assumed. |

## Integrations

| Item | Status |
|---|---|
| Integration provisioning | ✅ VERIFIED (Phase 11) - `POST /api/v1/admin/integrations`, CEO_ADMIN only, validates tenant + adapter registration, secret returned exactly once, never on ordinary reads. Live-tested: created integration immediately accepted a validly-signed webhook and rejected an invalid one. |
| Credentials securely configured | Process defined (`docs/client-onboarding-checklist.md` - secure exchange, never chat/Telegram); per-client verification required at provisioning time |
| Webhook signatures verified | ✅ VERIFIED mechanism (fails closed without a valid signature) - re-confirmed live in Phase 11 against a freshly-provisioned integration, not just the pre-existing demo one |
| API permissions minimized | Per-client - confirm during `docs/integration-feasibility-template.md` |
| Rate limits understood | Per-client - confirm during technical discovery |

## Documentation

| Item | Status |
|---|---|
| Client contacts | Captured per `docs/sales-to-engineering-handoff.md` |
| Escalation contacts | Captured per `docs/client-incident-process.md` |
| Integration documentation | Captured per `docs/integration-feasibility-template.md` |
| Pilot scope | Captured per `docs/7-day-pilot.md` |
| Success criteria | Captured per `docs/pilot-metrics.md` |

## Gate result

**Given the current production state, a first real client is technically ready from an infrastructure/application-security standpoint, with one honest caveat: offsite backups are not yet configured.** Whether that caveat alone blocks a specific client depends on that client's own data-loss tolerance - discuss it with them explicitly rather than deciding unilaterally. Everything else on this list is either verified or is a normal per-client step that happens naturally during onboarding, not a systemic gap.
