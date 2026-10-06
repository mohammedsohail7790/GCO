import type { IntegrationAdapter } from './adapter'
import { DevMockAdapter } from './adapters/devMock'
import { GcoWebhookAdapter } from './adapters/gcoWebhook'

const registry: Record<string, IntegrationAdapter> = {
  'dev-mock': new DevMockAdapter(),
  'gco-webhook': new GcoWebhookAdapter(),
}

export function getAdapter(key: string): IntegrationAdapter {
  const adapter = registry[key]
  if (!adapter) throw new Error(`No integration adapter registered for key "${key}"`)
  return adapter
}

/** Used to validate `adapterKey` at Integration-creation time (see app/api/v1/admin/integrations/route.ts) so a typo or
 *  unbuilt provider can never be persisted as if it were a working integration. */
export function listAdapterKeys(): string[] {
  return Object.keys(registry)
}

// Production capability is an EXPLICIT property of each adapter (`productionCapable`), never inferred from the adapter
// merely existing. `dev-mock` is false: its outbound send is simulated (it reports "delivered" without sending
// anything), so a client "live" on it would silently lose every reply. Such an adapter never satisfies and is never
// activated by production go-live - unless ALLOW_DEV_ADAPTERS=true, which exists for local/CI testing and must stay
// unset in production. The flag also relaxes the outbound-URL safety checks for local test clients.
export function isProductionAdapter(key: string): boolean {
  const adapter = registry[key]
  if (!adapter) return false
  return adapter.productionCapable === true || process.env.ALLOW_DEV_ADAPTERS === 'true'
}

/** Registered adapter keys that may serve a real client right now. */
export function listProductionAdapterKeys(): string[] {
  return Object.keys(registry).filter(isProductionAdapter)
}

/** Adapters that can prove connectivity (signed round trip) before go-live. Others need no verification. */
export function supportsVerification(key: string): boolean {
  return typeof registry[key]?.verifyOutbound === 'function'
}
