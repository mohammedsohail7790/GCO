import { db } from '@/lib/db/client'
import { supportsVerification } from './registry'

// Integration verification state lives in the (non-secret) Integration.config JSON under `verification`:
//   { callbackUrl, outboundAt?, inboundAt? }
// outboundAt = GCO delivered a signed ping to the client's endpoint and got 2xx.
// inboundAt  = the client sent a signed ping to GCO's webhook and it authenticated.
// It only counts for the callbackUrl it was recorded against, and is cleared when the secret is rotated.

export interface VerificationState {
  callbackUrl?: string
  outboundAt?: string
  inboundAt?: string
}

export function readVerification(config: unknown): VerificationState {
  const v = (config as { verification?: VerificationState } | null)?.verification
  return v && typeof v === 'object' ? v : {}
}

/** True when this integration needs no verification (adapter cannot ping) or both directions are proven for the current URL. */
export function isIntegrationVerified(adapterKey: string, config: unknown): boolean {
  if (!supportsVerification(adapterKey)) return true
  const v = readVerification(config)
  const current = (config as { callbackUrl?: string } | null)?.callbackUrl
  return !!v.outboundAt && !!v.inboundAt && !!current && v.callbackUrl === current
}

export async function recordVerification(integrationId: string, direction: 'outbound' | 'inbound') {
  const integ = await db.integration.findUnique({ where: { id: integrationId }, select: { config: true } })
  if (!integ) return
  const config = (integ.config ?? {}) as Record<string, unknown>
  const callbackUrl = typeof config.callbackUrl === 'string' ? config.callbackUrl : undefined
  let v = readVerification(config)
  if (v.callbackUrl !== callbackUrl) v = { callbackUrl } // the destination changed: earlier proof no longer applies
  const next = { ...v, callbackUrl, [direction === 'outbound' ? 'outboundAt' : 'inboundAt']: new Date().toISOString() }
  await db.integration.update({ where: { id: integrationId }, data: { config: { ...config, verification: next } as any } })
}

export async function clearVerification(integrationId: string) {
  const integ = await db.integration.findUnique({ where: { id: integrationId }, select: { config: true } })
  const config = { ...((integ?.config ?? {}) as Record<string, unknown>) }
  if (!('verification' in config)) return
  delete config.verification
  await db.integration.update({ where: { id: integrationId }, data: { config: config as any } })
}
