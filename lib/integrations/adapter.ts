// Integration adapter abstraction: every external client dating platform is
// wrapped behind this interface so the core pipeline never talks to a
// specific vendor's API shape directly.
//
//   External Client -> Adapter.normalizeInbound() -> GCO Message Model
//   GCO Message Model -> Adapter.sendOutbound() -> External Client
//
// Add a new client by implementing this interface and registering it in
// lib/integrations/registry.ts - no changes to core pipeline code required.

export interface NormalizedInboundMessage {
  externalEventId: string // for webhook dedup
  externalMessageId: string // for message-level idempotency
  externalUserId: string
  content: string
  language?: string
  sentAt: Date
}

export interface OutboundSendRequest {
  externalUserId: string
  content: string
  externalMessageId: string // GCO-generated, echoed back for correlation
}

export interface OutboundSendResult {
  delivered: boolean
  externalDeliveryId?: string
  error?: string
}

export interface IntegrationAdapter {
  key: string

  /** Verifies the inbound webhook is authentically from this integration (e.g. HMAC signature). */
  verifyWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean

  /** Converts a raw webhook payload into GCO's normalized message shape. Throws on malformed payloads. */
  normalizeInbound(payload: unknown): NormalizedInboundMessage[]

  /** Sends an operator-approved reply back to the external platform. */
  sendOutbound(req: OutboundSendRequest, config: Record<string, unknown>): Promise<OutboundSendResult>
}
