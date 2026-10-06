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
  /** True ONLY when the real destination accepted the message according to its actual API semantics. */
  delivered: boolean
  externalDeliveryId?: string
  error?: string
  /** false = permanent (e.g. client rejected the request); retrying cannot help. Default: retryable. */
  retryable?: boolean
  /** Coarse, content-free category for observability (timeout, network, client_4xx, server_5xx, rate_limited ...). */
  failureCategory?: string
  latencyMs?: number
}

/** Per-integration runtime context. `secret` is the integration's webhook secret - never log it. */
export interface AdapterContext {
  integrationId: string
  tenantId: string
  secret: string | null
}

export interface VerificationResult {
  ok: boolean
  category?: string
  latencyMs?: number
}

export interface IntegrationAdapter {
  key: string

  /**
   * Explicit capability, never inferred: true only when this adapter performs REAL delivery to a real client
   * platform. A development/mock adapter must be false - it can never satisfy or be activated by production go-live.
   */
  productionCapable: boolean

  /** Verifies the inbound webhook is authentically from this integration (e.g. HMAC signature, timestamp window). */
  verifyWebhookSignature(rawBody: string, headers: Headers, secret: string): boolean

  /** Optional synchronous structural check run BEFORE anything is persisted. Throws on a malformed payload. */
  validateInbound?(payload: unknown): void

  /** Converts a raw webhook payload into GCO's normalized message shape. Throws on malformed payloads. */
  normalizeInbound(payload: unknown): NormalizedInboundMessage[]

  /** Optional: validates integration config at creation. Returns an error message, or null when valid. */
  validateConfig?(config: Record<string, unknown>): Promise<string | null>

  /** Sends an operator-approved reply back to the external platform. */
  sendOutbound(req: OutboundSendRequest, config: Record<string, unknown>, ctx?: AdapterContext): Promise<OutboundSendResult>

  /** Optional: a signed no-op round trip to the destination, used to verify an integration before go-live. */
  verifyOutbound?(config: Record<string, unknown>, ctx: AdapterContext): Promise<VerificationResult>

  /** Optional: true if an inbound payload is a signed connectivity test (not a conversation message). */
  isPing?(payload: unknown): boolean
}
