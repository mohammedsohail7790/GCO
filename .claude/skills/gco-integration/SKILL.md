---
name: gco-integration
description: Owns work on GCO's IntegrationAdapter boundary (lib/integrations/adapter.ts, registry.ts, adapters/*). Requires an actual client API specification/sandbox before implementing a real (non-dev-mock) adapter. Never invents client authentication, payloads, IDs, or webhook signatures. Never modifies the core pipeline.
---

# GCO Integration

## Purpose

Govern any work on GCO's integration boundary — the interface that isolates the core message pipeline from any specific external client platform's API shape. This skill's defining rule: **it must never fabricate client behavior.** A real client adapter may only be implemented against a real, provided specification.

## The interface (as it exists today — do not redesign)

```
External Client -> Adapter.normalizeInbound() -> GCO Message Model
GCO Message Model -> Adapter.sendOutbound() -> External Client
```

`lib/integrations/adapter.ts` defines `IntegrationAdapter`:
- `verifyWebhookSignature(rawBody, headers, secret): boolean`
- `normalizeInbound(payload): NormalizedInboundMessage[]` — throws on malformed payloads
- `sendOutbound(req, config): Promise<OutboundSendResult>`

`lib/integrations/registry.ts` is the single swap point (`getAdapter(key)`) — adding a client means implementing the interface and registering it here, with **no changes to core pipeline code required**, per the interface's own documented design.

`lib/integrations/adapters/devMock.ts` (`DevMockAdapter`, key `'dev-mock'`) is the **only** adapter currently registered. It is explicitly a development/reference implementation ("Clearly isolated from any production integration code — do not treat this as a real client") using HMAC-SHA256 signatures and a synthetic `{ events: [{ event_id, message_id, user_id, text, lang?, sent_at }] }` payload shape that is GCO's own invention, not any real client's contract.

## The client-spec gate (hard requirement — check this first, every time)

Before writing **any** adapter code beyond the existing `dev-mock` reference:

1. Check whether the conversation actually contains a real client's API specification, sandbox access, or credentials.
2. If it does not, **stop** — do not generate adapter code against an assumed or inferred shape. Instead, surface `docs/GCO_CLIENT_TECHNICAL_QUESTIONNAIRE.md`'s 16-item readiness checklist and state which items are still unanswered.
3. Only proceed to write a new adapter file once a real spec is in hand, and only implement what the spec actually documents — never fill a gap with a plausible-sounding guess.

This mirrors `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §26 Phase 3, which is explicitly gated: "**BLOCKED until a client's spec and sandbox access exist.**"

## When to invoke automatically

- The user asks to add, modify, or review an integration adapter.
- The conversation references connecting a real client, or the client onboarding questionnaire.
- Any diff touches `lib/integrations/**`.

## When NOT to invoke

- If the request is actually about the core message pipeline (`lib/messages/**`, `lib/assignment/**`, `lib/ai/**`) rather than the adapter boundary — that's `gco-engineering`, and this skill must not be used as a backdoor to touch those files "on behalf of" an integration need.
- If no real client spec/sandbox exists and the request is to "build a real adapter anyway" — decline per the gate above rather than inventing one.

## Required repository context

- `lib/integrations/adapter.ts`, `lib/integrations/registry.ts`, `lib/integrations/adapters/devMock.ts`
- `docs/GCO_CLIENT_TECHNICAL_QUESTIONNAIRE.md` (the generic, client-agnostic questionnaire and its 16-item checklist)
- `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §10 (integration architecture), §19 (onboarding model), §26 Phase 3 (acceptance criteria)

## Procedure

1. Run the client-spec gate above.
2. If proceeding, implement the new adapter as a new file under `lib/integrations/adapters/`, implementing exactly the `IntegrationAdapter` interface — no interface changes unless the spec reveals the interface itself is insufficient, in which case stop and flag that as a boundary-level decision requiring explicit approval (interface changes ripple into the core pipeline's usage of it).
3. Register the new adapter in `lib/integrations/registry.ts` only.
4. Do not touch `lib/messages/ingest.ts`, `lib/messages/send.ts`, `lib/assignment/**`, `lib/ai/**`, or any queue/worker code to "accommodate" a client — client-specific logic belongs entirely inside `lib/integrations/**`. If a client's real behavior seems to require a core-pipeline change, stop and surface that explicitly rather than making the change under the integration skill's authority.
5. After implementation, run the full E2E suite (via `gco-testing`) to demonstrate the core pipeline needed no changes — this is the actual acceptance criterion from `docs/GCO_V1_PRODUCT_TECHNICAL_DRAFT.md` §26 Phase 3 ("existing E2E suite still passes unmodified, proving the core pipeline needed no changes").

## Verification requirements

- State explicitly, for each field/behavior implemented, whether it came from the real spec or is still an assumption — never blur the two.
- Confirm via `git diff` that only files under `lib/integrations/**` (and the new adapter's own tests, if added under `tests/`) changed.
- Run the full E2E suite via `gco-testing` and report the result as this skill's regression evidence.

## Security constraints

- Never invent a webhook signature scheme, authentication method, ID semantics, or delivery-status taxonomy for a client — if the spec doesn't say, stop and ask; do not default to the `dev-mock` HMAC scheme and call it "the client's."
- Never hardcode credentials for any client, real or hypothetical.
- Keep all client-specific logic confined to the adapter boundary — this is the security/maintainability property the interface exists to preserve.

## Relationship to other GCO skills

- General implementation conventions (smallest safe change, verification-plan requirement) → inherited from `gco-engineering`; this skill adds the client-spec gate and narrows the file scope to `lib/integrations/**` on top of those rules rather than restating them.
- Regression testing → delegate to `gco-testing`.
- If a real client's webhook verification needs security review once implemented → `gco-security-review` (webhook HMAC is already on that skill's known threat surface).
- Readiness statements about integration status → `gco-production-readiness` owns the "VERIFIED (dev-mock only) / BLOCKED (real client)" framing; this skill supplies the underlying facts.

## Must never do

- Fabricate a client's payload shape, authentication scheme, ID semantics, webhook signature method, or delivery-status mechanism.
- Claim "real client integration" exists when only the interface and `dev-mock` adapter exist.
- Modify core pipeline files (`lib/messages/**`, `lib/assignment/**`, `lib/ai/**`, queue/worker code) under the guise of integration work.
- Skip the full E2E regression run that proves the core pipeline needed no changes.
- Treat the questionnaire's unanswered items as optional when about to write adapter code — an unchecked box in `docs/GCO_CLIENT_TECHNICAL_QUESTIONNAIRE.md`'s checklist is a blocker to writing code against *real* shapes, per that document's own stated purpose.
