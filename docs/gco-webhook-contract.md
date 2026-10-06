# GCO signed-webhook contract (`gco-webhook` adapter)

The integration contract a client's platform implements to exchange conversations with GCO. It is GCO's own protocol (the
"custom client API / webhook" channel), not a third-party provider. Both directions are signed with the integration's own
secret (issued once by GCO; never put it in config, logs or chat).

## Signing
`X-GCO-Timestamp: <unix seconds>` and `X-GCO-Signature: v1=<hex>` where `hex = HMAC-SHA256(secret, "<timestamp>.<raw body>")`.
Sign the exact bytes you send. GCO rejects a timestamp more than 5 minutes from its clock (replay window).

```js
const ts = String(Math.floor(Date.now() / 1000))
const sig = 'v1=' + require('crypto').createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')
```

## Inbound: client -> GCO
`POST https://<gco-host>/api/v1/webhooks/<integrationId>` - `Content-Type: application/json`

```json
{ "events": [ { "event_id": "e-1", "message_id": "m-1", "user_id": "end-user-42", "text": "Hello", "lang": "it", "sent_at": "2026-10-06T10:00:00Z" } ] }
```
- 1-100 events; `event_id`, `message_id`, `user_id` required strings (<= 200 chars); `text` 1-4000 chars; `lang` (<= 16) and `sent_at` (ISO) optional.
- `202` accepted (queued) - `200` with `deduplicated: true` for an exact repeat - `400` malformed (nothing stored) - `401` bad/missing/stale signature - `404` unknown or not-yet-live integration - `429` rate limited.
- Retries are safe: the same body is deduplicated, and `message_id` is idempotent per conversation.
- **Connectivity test:** `{ "type": "ping" }` (signed) returns `200` and creates nothing. It is also accepted while the integration is staged (not yet live), which is how the client proves inbound connectivity before go-live.

## Outbound: GCO -> client
`POST <callbackUrl>` (configured on the integration; must be `https`, public hostname, default port, no credentials, no redirects)

```json
{ "type": "message.reply", "message_id": "out_...", "user_id": "end-user-42", "text": "Happy to help", "sent_at": "2026-10-06T10:00:05Z" }
```
Headers: the signing headers above, `Idempotency-Key: <message_id>`, `User-Agent: GCO-Webhook/1`.
- Answer **2xx** only once the reply has been accepted for delivery to the end user. Optionally `{ "delivery_id": "..." }` in the body or an `X-Request-Id` header (recorded as the delivery reference).
- GCO marks a reply **delivered only on 2xx**. Timeouts (8 s), connection errors, `408/425/429` and `5xx` are retried with backoff, always with the same `message_id` / `Idempotency-Key`; other `4xx` and redirects are permanent failures (the message stays FAILED and GCO staff are alerted).
- Delivery is **at-least-once**: your endpoint must ignore a repeated `message_id`.
- Connectivity test: `{ "type": "ping", "ping_id": "..." }` (signed) - answer 2xx.

## Go-live prerequisites (GCO side)
Integration created staged (DISABLED) with the callback URL -> GCO's outbound ping answered 2xx -> your inbound ping accepted -> checklist complete -> CEO go-live activates it. Rotating the secret clears verification (re-verify before relying on it).
