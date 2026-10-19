# Moderation module (chat moderation and community moderation)

**Status:** built and tested against the platform's own APIs. **Not validated against any real client platform** — there is none yet. The ingest payload below is GCO's **proposed** contract and must be confirmed with each client (see `docs/GCO_CLIENT_DISCOVERY_PACKAGE.md`).

## Flow

1. A client's platform sends content to `POST /api/v1/moderation/ingest/{integrationId}` with an `X-GCO-Signature` header, signed over the raw body with the integration's own secret. This is the **same verification as the message webhook** (the integration's adapter), not a new scheme. The client's moderation service must be switched on (Admin → New client wizard or `PUT /api/v1/tenant/services`).
2. Items are stored once per `(client, kind, externalItemId)` — re-sending is safe.
3. An operator presses **Get next items** (`/operator/moderation`): up to 5 items are claimed (highest priority, oldest first; concurrent operators never get the same item; a claim idle for 15 minutes returns to the queue).
4. The operator **approves**, **rejects** (must pick one of the client's violation categories) or **escalates** (must say why). Decisions are append-only.
5. Supervisors/managers resolve escalations, confirm or decline requested warnings/restrictions (never the person who asked), and review appeals (never anyone who decided that item).
6. Clients see counts only (`/api/v1/client/moderation/summary`) and can forward an appeal for a decided item.

## Proposed ingest payload

```json
{ "items": [
  { "kind": "COMMENT", "externalItemId": "c-123", "subjectExternalId": "user-9", "content": "text…", "flagReason": "user report", "language": "en", "priority": 2 },
  { "kind": "IMAGE", "externalItemId": "img-77", "subjectExternalId": "user-4", "mediaUrl": "https://cdn.client.example/p.png" }
] }
```

`kind`: MESSAGE, IMAGE, PROFILE, POST, COMMENT, REPORT. 1–100 items per call, 1 MB max. `mediaUrl` must be https; GCO never fetches it (operators open it in a new tab with no referrer).

## Known limits (honest list)

- **Verdicts are not sent back** to the client platform. That needs each client's API (callback or polling with client credentials) — blocked on a real spec; inventing one would violate the integration rules. Decisions are visible in the portal summary and retrievable internally.
- **Warnings, restrictions and bans are records and requests** inside GCO; applying them on the client's platform is the client's side until a callback exists.
- No automated/AI classification yet (Phase 4); the AI mode `AI_PLUS_HUMAN` is intentionally not selectable.
- Image review shows the client's link, not an embedded preview (avoids third-party image requests from GCO's pages).
- Per-category policies are free text in **Client knowledge → Instructions**; categories are a per-client list (`Tenant.moderationCategories`, default: spam, harassment, nudity, hate, violence, scam, underage, other).
- Moderators are paid through the same earnings ledger only for **messages they send**; paying per moderation decision is not modelled yet (a rate-card basis would be added once the commercial model is agreed).
- Privacy: retention and erasure also blank moderation content and media links; decisions and counts stay.
