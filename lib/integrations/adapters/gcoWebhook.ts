import crypto from 'crypto'
import type { AdapterContext, IntegrationAdapter, NormalizedInboundMessage, OutboundSendRequest, OutboundSendResult, VerificationResult } from '../adapter'
import { postJson, SafeHttpError, validateCallbackUrl } from '../safeHttp'

/**
 * GCO signed-webhook adapter ("custom client API / webhook" in docs/client-capability-matrix.md).
 *
 * A client's platform talks to GCO over a small, documented, HMAC-signed contract (docs/gco-webhook-contract.md):
 *   INBOUND  client -> GCO   POST /api/v1/webhooks/<integrationId>   { events: [...] }  or  { type: "ping" }
 *   OUTBOUND GCO -> client   POST <config.callbackUrl>               { type: "message.reply", ... }
 * Both directions are signed with the integration's own secret:
 *   X-GCO-Timestamp: <unix seconds>      X-GCO-Signature: v1=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * Inbound requests older/newer than 5 minutes are rejected (replay window); the event id gives exact-duplicate dedup.
 *
 * Delivery semantics: a reply is "delivered" ONLY if the client's endpoint answered 2xx. Everything else is a failure
 * (retryable: timeout / network / 408 / 425 / 429 / 5xx; permanent: other 4xx, redirects, unsafe destination).
 * Delivery is at-least-once: every attempt carries the same `message_id` and `Idempotency-Key`, which the client must
 * use to ignore a repeat.
 */
export const TIMESTAMP_TOLERANCE_SECONDS = 300
const MAX_EVENTS = 100
const MAX_TEXT = 4000
const MAX_ID = 200
// Overridable only for tests (GCO_WEBHOOK_TIMEOUT_MS); production uses the default.
const outboundTimeoutMs = () => Number(process.env.GCO_WEBHOOK_TIMEOUT_MS) || 8000

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return 'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

function validateEvents(payload: unknown) {
  if (!isObj(payload) || !Array.isArray(payload.events)) throw new Error('Invalid payload: expected { events: [...] }')
  if (payload.events.length === 0 || payload.events.length > MAX_EVENTS) throw new Error(`Invalid payload: between 1 and ${MAX_EVENTS} events required`)
  for (const e of payload.events) {
    if (!isObj(e) || !str(e.event_id, MAX_ID) || !str(e.message_id, MAX_ID) || !str(e.user_id, MAX_ID)) throw new Error('Invalid event: event_id, message_id and user_id are required strings')
    if (!str(e.text, MAX_TEXT)) throw new Error(`Invalid event: text is required (1-${MAX_TEXT} characters)`)
    if (e.lang !== undefined && !str(e.lang, 16)) throw new Error('Invalid event: lang')
    if (e.sent_at !== undefined && (typeof e.sent_at !== 'string' || Number.isNaN(Date.parse(e.sent_at)))) throw new Error('Invalid event: sent_at must be an ISO date')
  }
}

export class GcoWebhookAdapter implements IntegrationAdapter {
  key = 'gco-webhook'
  // Performs a real HTTPS call to the client's endpoint and reports delivery only on a 2xx answer.
  productionCapable = true

  verifyWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean {
    const ts = headers.get('x-gco-timestamp')
    const sig = headers.get('x-gco-signature')
    if (!ts || !sig || !/^\d{9,12}$/.test(ts)) return false
    if (Math.abs(Date.now() / 1000 - Number(ts)) > TIMESTAMP_TOLERANCE_SECONDS) return false // replay window
    const a = Buffer.from(sig)
    const b = Buffer.from(signPayload(secret, ts, rawBody))
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  }

  isPing(payload: unknown): boolean {
    return isObj(payload) && payload.type === 'ping'
  }

  validateInbound(payload: unknown): void {
    if (this.isPing(payload)) return
    validateEvents(payload)
  }

  normalizeInbound(payload: unknown): NormalizedInboundMessage[] {
    validateEvents(payload)
    return (payload as { events: any[] }).events.map((e) => ({
      externalEventId: String(e.event_id),
      externalMessageId: String(e.message_id),
      externalUserId: String(e.user_id),
      content: e.text,
      language: e.lang,
      sentAt: e.sent_at ? new Date(e.sent_at) : new Date(),
    }))
  }

  async validateConfig(config: Record<string, unknown>): Promise<string | null> {
    const unknown = Object.keys(config).filter((k) => !['callbackUrl', 'verification'].includes(k))
    if (unknown.length) return `Unsupported config key(s): ${unknown.join(', ')}`
    if (config.verification !== undefined) return 'verification is set by GCO, not by configuration'
    return validateCallbackUrl(config.callbackUrl)
  }

  private signed(secret: string, body: string, extra: Record<string, string> = {}) {
    const ts = String(Math.floor(Date.now() / 1000))
    return { 'Content-Type': 'application/json', 'User-Agent': 'GCO-Webhook/1', 'X-GCO-Timestamp': ts, 'X-GCO-Signature': signPayload(secret, ts, body), ...extra }
  }

  async sendOutbound(req: OutboundSendRequest, config: Record<string, unknown>, ctx?: AdapterContext): Promise<OutboundSendResult> {
    const started = Date.now()
    const bad = (error: string, failureCategory: string, retryable: boolean): OutboundSendResult => ({ delivered: false, error, failureCategory, retryable, latencyMs: Date.now() - started })
    if (!ctx?.secret) return bad('Integration has no webhook secret', 'credential', false)
    const urlError = validateCallbackUrl(config.callbackUrl)
    if (urlError) return bad(urlError, 'bad_config', false)

    const body = JSON.stringify({ type: 'message.reply', message_id: req.externalMessageId, user_id: req.externalUserId, text: req.content, sent_at: new Date().toISOString() })
    try {
      const res = await postJson(String(config.callbackUrl), this.signed(ctx.secret, body, { 'Idempotency-Key': req.externalMessageId }), body, { timeoutMs: outboundTimeoutMs() })
      if (res.status >= 200 && res.status < 300) {
        let deliveryId: string | undefined
        try {
          const j = JSON.parse(res.body)
          if (isObj(j) && str(j.delivery_id, MAX_ID)) deliveryId = j.delivery_id
        } catch {
          /* body is optional */
        }
        const hdr = res.headers['x-request-id']
        deliveryId ??= typeof hdr === 'string' && hdr.length <= MAX_ID ? hdr : undefined
        return { delivered: true, externalDeliveryId: deliveryId, latencyMs: res.latencyMs }
      }
      if ([408, 425, 429].includes(res.status)) return bad(`Client endpoint answered ${res.status}`, res.status === 429 ? 'rate_limited' : 'client_busy', true)
      if (res.status >= 500) return bad(`Client endpoint answered ${res.status}`, 'server_5xx', true)
      if (res.status === 401 || res.status === 403) return bad(`Client endpoint rejected the request (${res.status}) - check the shared secret`, 'credential', false)
      return bad(`Client endpoint rejected the request (${res.status})`, 'client_4xx', false)
    } catch (err) {
      if (err instanceof SafeHttpError) {
        const permanent = err.category === 'bad_url' || err.category === 'dns_blocked' || err.category === 'redirect' || err.category === 'too_large'
        return bad(err.message, err.category, !permanent)
      }
      return bad('Outbound request failed', 'network', true)
    }
  }

  async verifyOutbound(config: Record<string, unknown>, ctx: AdapterContext): Promise<VerificationResult> {
    if (!ctx.secret) return { ok: false, category: 'credential' }
    if (validateCallbackUrl(config.callbackUrl)) return { ok: false, category: 'bad_config' }
    const body = JSON.stringify({ type: 'ping', ping_id: crypto.randomUUID() })
    try {
      const res = await postJson(String(config.callbackUrl), this.signed(ctx.secret, body), body, { timeoutMs: outboundTimeoutMs() })
      if (res.status >= 200 && res.status < 300) return { ok: true, latencyMs: res.latencyMs }
      return { ok: false, category: res.status === 401 || res.status === 403 ? 'credential' : res.status >= 500 ? 'server_5xx' : 'client_4xx', latencyMs: res.latencyMs }
    } catch (err) {
      return { ok: false, category: err instanceof SafeHttpError ? err.category : 'network' }
    }
  }
}
