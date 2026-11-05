# GCO client integration guide (draft for clients, 5 Nov 2026)

This guide explains how a client system exchanges chat messages with GCO's human operators. Full technical contract: `docs/gco-webhook-contract.md`.

## What GCO handles
- **Text only.** Images, files, voice, video, stickers, buttons and rich cards are not accepted and are not sent. If a client's channel carries them, the client's system must leave them out or replace them with a short text note before sending to GCO.
- **4,000 characters per message**, in both directions. A longer customer message is rejected (`400`) and must be split by the client. Operator replies are also limited to 4,000 characters. Characters are counted as the platform counts string length, so some emoji count as two.
- **Human operators only.** AI is switched off; no message is drafted or sent by AI.

## How it works
1. **Customer message → GCO.** The client's system sends an HTTPS `POST` to the GCO address for its integration, with up to 100 messages per request and at most 1 MB per request. Each message carries a message ID, a customer ID, the text, and optionally the language and time.
2. **GCO → client.** When an operator replies, GCO sends an HTTPS `POST` to the client's callback address. GCO marks the reply **delivered** only when the client's system answers with a `2xx` status.
3. **Retries are safe in both directions.** Repeated messages are recognised by their IDs and not duplicated. GCO retries its own deliveries on timeouts (8 seconds), `408`, `425`, `429` and `5xx`, always with the same ID.

## Technical requirements for the client
| Requirement | Detail |
|---|---|
| Transport | HTTPS only; the callback must be a public hostname on the default port, with no redirects and no credentials in the address |
| Signing | Every request in both directions is signed with a shared secret: `X-GCO-Timestamp` (Unix seconds) and `X-GCO-Signature: v1=<HMAC-SHA256 of "<timestamp>.<raw body>">`. Requests more than 5 minutes old are refused |
| Format | JSON, UTF-8 |
| IDs | Stable, unique message IDs and customer IDs (up to 200 characters); no names, emails or phone numbers in IDs |
| Answering GCO | Return `2xx` only once the reply has been accepted for delivery to the customer |
| Test environment | A sandbox or test account on the client side, with fictional data, before any live traffic |
| Secret handling | The shared secret is exchanged once over a secure channel and can be rotated on request |

## Going live
1. GCO creates the integration in a disabled state with the client's callback address.
2. Both sides send a signed test message and confirm it arrives.
3. A short end-to-end test with fictional customers: message in, operator reply out, delivery confirmed.
4. GCO's Founder activates the integration. Live traffic starts only after the signed agreements (pilot agreement and data processing agreement) are in place.

## Not included as standard
Other formats (email, SMS, voice), attachments, and client-specific APIs. GCO can build a client-specific adapter when it is commercially justified; that needs the client's API documentation and a sandbox first.
