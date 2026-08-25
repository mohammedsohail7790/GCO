import crypto from 'crypto'
import type { IntegrationAdapter, NormalizedInboundMessage, OutboundSendResult } from '../adapter'

// Development/reference adapter used until a real client platform's API spec
// is available. Clearly isolated from any production integration code - do
// not treat this as a real client. Payload shape:
// { events: [{ event_id, message_id, user_id, text, lang?, sent_at }] }
export class DevMockAdapter implements IntegrationAdapter {
  key = 'dev-mock'

  verifyWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean {
    const signature = headers.get('x-gco-signature')
    if (!signature) return false
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    // timing-safe compare
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  normalizeInbound(payload: unknown): NormalizedInboundMessage[] {
    const body = payload as { events?: any[] }
    if (!body || !Array.isArray(body.events)) {
      throw new Error('Invalid dev-mock payload: expected { events: [...] }')
    }
    return body.events.map((e) => {
      if (!e.event_id || !e.message_id || !e.user_id || typeof e.text !== 'string') {
        throw new Error('Invalid dev-mock event: missing required fields')
      }
      return {
        externalEventId: String(e.event_id),
        externalMessageId: String(e.message_id),
        externalUserId: String(e.user_id),
        content: e.text,
        language: e.lang,
        sentAt: e.sent_at ? new Date(e.sent_at) : new Date(),
      }
    })
  }

  async sendOutbound(): Promise<OutboundSendResult> {
    // Simulated delivery - always succeeds. Swap for a real HTTP call once a
    // client's outbound API spec is available.
    return { delivered: true, externalDeliveryId: crypto.randomUUID() }
  }
}
