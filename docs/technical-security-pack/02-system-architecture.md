# 02 — System architecture

Everything shown is implemented in the repository; components marked *(planned)* are not.

```mermaid
flowchart LR
  subgraph Internet
    U1[Operators / managers / CEO / clients / hunters<br/>browsers]
    CP[Client platform<br/>(external system)]
    V[Website visitors]
  end
  CF[Cloudflare<br/>DNS + edge TLS]
  subgraph Host["GCO server (single host)"]
    CAD[Caddy reverse proxy<br/>TLS to origin]
    subgraph Trust["Application trust boundary"]
      WEB[Next.js web app + API<br/>auth, RBAC, tenant scoping]
      RT[Realtime WebSocket server<br/>30-second tickets]
      WK[BullMQ worker<br/>ingest, delivery, SLA, handoff, sweeps]
    end
    PG[(PostgreSQL<br/>all application data)]
    RD[(Redis<br/>queues + rate limits)]
    TM[systemd timers<br/>backup, retention, alerts, reports]
  end
  B2[(Backblaze B2<br/>offsite DB dumps)]
  SM[SMTP provider<br/>optional, off by default]
  AI[AI provider<br/>DISABLED]
  U1 --> CF --> CAD --> WEB
  V --> CF
  U1 -. wss .-> CAD -.-> RT
  CP -- signed webhooks --> CAD
  WEB --> PG
  WEB --> RD
  WK --> PG
  WK --> RD
  RT --> RD
  WK -- signed, HTTPS-only, SSRF-checked callbacks --> CP
  TM --> PG
  TM --> B2
  WK -. optional .-> SM
  WK -. never called .-> AI
```

Trust boundaries: Internet ⇄ Cloudflare/Caddy (TLS); browser ⇄ application (session cookies/JWT, RBAC); client platform ⇄ application (per-integration HMAC secret); application ⇄ data stores (private Docker network, no published database ports).

## Components
| Component | Detail | Status |
|---|---|---|
| Frontend / routing | Next.js 16 App Router, React 18; role-based dashboards (`/admin`, `/manager`, `/operator`, `/client-panel`, `/hunter`, `/cto`) behind an edge role gate (UX only; the API enforces everything) | Verified |
| Backend / API | 162 route handlers under `/api/v1`, Zod validation, uniform error responses; every handler checks the caller (structural test) | Verified |
| Database | PostgreSQL 16 via Prisma; 60 models, 29 migrations; money in integer euro cents | Verified (local) |
| Queues | BullMQ/Redis: message ingest, outbound delivery, assignment timeout, analytics, BPO handoff, dead letter (AI queues exist but are inert while AI is off); retries with exponential backoff; manual dead-letter recovery | Verified (local) |
| Realtime | WebSocket; short-lived single-purpose tickets; per-tenant channels; polling fallback so realtime is an accelerator only | Verified |
| Authentication / RBAC | JWT + refresh sessions, bcrypt, optional TOTP; 8 roles with a permission matrix | Verified |
| Tenant isolation | every record carries `tenantId`; scope resolved server-side from the session | Verified at application layer; no database row-level security *(planned/not adopted)* |
| Generic webhook layer | per-integration secret, HMAC signature, replay window (`gco-webhook`), idempotent ingest, signed outbound callbacks | Implemented; verified against test doubles only |
| Scheduled processing | worker sweeps (re-assign queued work every 15 s, release expired lead locks) and systemd timers | Verified (sweeps); timers **documented, not installed on a server** |
| Logging / monitoring | structured JSON logs, system events, in-app alerts and notifications, optional email; external uptime monitor (account-owned, state unverified) | Partially implemented |
| Backups | nightly dump + offsite copy | Documented active; restore of a production dump **not verified** (local drill passed) |
| Deployment | Docker Compose (5 services), Caddy, Cloudflare; separate staging definition | Documented; Docker **not verified** here |
| Environment separation | dev / staging / production flags (`GCO_ENVIRONMENT`), staging refuses real adapters and seeds fictional data only | Verified locally |

## Not in this architecture (stated so nothing is assumed)
Multi-region failover; load balancer or autoscaling; managed database with point-in-time recovery; row-level security; a web application firewall beyond Cloudflare's free plan; error-tracking service; any AI service in operation.
