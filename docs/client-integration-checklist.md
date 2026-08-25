# Client Integration Checklist

This is the exact information required from a real client (dating platform) before their integration can be built. **None of it may be invented or assumed** — GCO's integration layer is built as an abstraction (`lib/integrations/adapter.ts`) specifically so the core pipeline never depends on any one client's API shape, but the *adapter itself* has to be written against that client's real, documented behavior. Guessing produces an adapter that looks complete and fails silently against the real API — worse than not building it at all.

Status: **BLOCKED** — no client has supplied this information yet. Only the `dev-mock` adapter (`lib/integrations/adapters/devMock.ts`) exists, clearly labeled as development-only.

## Required information

| # | Item | Why it's required |
|---|---|---|
| 1 | Webhook URL requirements | Whether they call a URL we give them, or we poll them; any URL format/path constraints on their end |
| 2 | Webhook signature method | `IntegrationAdapter.verifyWebhookSignature` needs the exact algorithm, header name, and canonicalization (HMAC-SHA256 like our dev adapter is an assumption, not a given) |
| 3 | Authentication | For any calls GCO makes *to* them (outbound send, status polling) — API key, OAuth, mTLS, etc. |
| 4 | Incoming message payload (real examples, not schema-only) | `normalizeInbound` must parse their actual JSON shape, including edge cases (empty text, attachments, system messages) |
| 5 | Conversation ID semantics | Do they have a stable conversation/thread identifier, or do we need to derive one from user pairs? |
| 6 | User ID semantics | Their identifier format for the end user on the dating app side |
| 7 | Message ID semantics | Needed for `externalMessageId` idempotency — must be stable and unique per their side |
| 8 | Timestamp semantics | Timezone, format (ISO 8601? Unix epoch? Which unit?), and whether it's send-time or receive-time |
| 9 | Outbound message API | The actual endpoint/method GCO calls to deliver an operator's reply |
| 10 | Delivery status / callback mechanism | How GCO learns whether an outbound message was actually delivered — sync response, async webhook, polling? |
| 11 | Error codes | What their API returns on failure, so `normalizeError` can distinguish retryable from permanent failures |
| 12 | Rate limits | Both directions — limits they impose on us, and any limits we should communicate back |
| 13 | Retry rules | Do they retry failed webhook deliveries to us? With what backoff? Do they expect us to retry failed sends, and how? |
| 14 | Media/attachment support | Whether messages can include images/media, and if so, the format (URL? base64? separate upload step?) |
| 15 | Sandbox/test environment | Required before writing a single line of adapter-specific test code — GCO's own tests must run against something real, not more guessing |
| 16 | Production credentials | Issued through a secure channel (never pasted into chat/email); stored via `Integration.secretRef` (see `docs/security.md`) — GCO never stores raw secrets in the database |

## What happens once this is supplied

1. Implement `lib/integrations/adapters/<client-key>.ts` against the existing `IntegrationAdapter` interface (`lib/integrations/adapter.ts`) — no core pipeline code changes required, that's the entire point of the abstraction already in place:

```ts
// lib/integrations/adapters/<client-key>.ts — SKELETON, not implemented.
// Every method below throws until real values from this checklist are available.
import type { IntegrationAdapter, NormalizedInboundMessage, OutboundSendResult } from '../adapter'

export class ClientXAdapter implements IntegrationAdapter {
  key = 'client-x'

  verifyWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean {
    throw new Error('Not implemented - needs item #2 (signature method) from the checklist')
  }

  normalizeInbound(payload: unknown): NormalizedInboundMessage[] {
    throw new Error('Not implemented - needs item #4 (real payload examples) from the checklist')
  }

  async sendOutbound(): Promise<OutboundSendResult> {
    throw new Error('Not implemented - needs items #9-10 (outbound API, delivery status) from the checklist')
  }
}
```

2. Register it in `lib/integrations/registry.ts`.
3. Write adapter-specific integration tests against their sandbox (item #15) — modeled on `tests/e2e/01-message-lifecycle.spec.ts` but hitting the real sandbox instead of `dev-mock`.
4. Create the `Integration` row via the admin API with `adapterKey: '<client-key>'` and the real webhook secret stored via `secretRef`.
5. Only then does that tenant go live.

## What is explicitly NOT done yet

- No client-specific adapter code exists beyond the dev-mock skeleton pattern shown above.
- No assumptions have been baked into the core pipeline about any specific client's payload shape — verified by the fact that `lib/messages/ingest.ts`, `lib/assignment/engine.ts`, etc. only ever call `adapter.normalizeInbound()`/`adapter.sendOutbound()` and never touch a raw payload directly.
