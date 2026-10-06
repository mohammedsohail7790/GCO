import type { IntegrationAdapter } from './adapter'
import { DevMockAdapter } from './adapters/devMock'

const registry: Record<string, IntegrationAdapter> = {
  'dev-mock': new DevMockAdapter(),
}

// Adapters that may serve a real client. `dev-mock` is a development/reference adapter: its outbound send is
// simulated (it reports "delivered" without sending anything), so a client "live" on it would silently lose every
// reply. It therefore never satisfies the go-live checklist and is never activated by go-live - unless
// ALLOW_DEV_ADAPTERS=true, which exists for local/CI testing and must stay unset in production.
// Add a key here only when its adapter performs real delivery.
const PRODUCTION_ADAPTER_KEYS: readonly string[] = []

export function isProductionAdapter(key: string): boolean {
  if (!(key in registry)) return false
  return PRODUCTION_ADAPTER_KEYS.includes(key) || process.env.ALLOW_DEV_ADAPTERS === 'true'
}

/** Registered adapter keys that may serve a real client right now (empty in production until a real adapter exists). */
export function listProductionAdapterKeys(): string[] {
  return Object.keys(registry).filter(isProductionAdapter)
}

export function getAdapter(key: string): IntegrationAdapter {
  const adapter = registry[key]
  if (!adapter) throw new Error(`No integration adapter registered for key "${key}"`)
  return adapter
}

/** Used to validate `adapterKey` at Integration-creation time (see
 *  app/api/v1/admin/integrations/route.ts) so a typo or unbuilt provider
 *  can never be persisted as if it were a working integration - previously
 *  nothing checked this until a webhook actually arrived and getAdapter()
 *  threw deep inside the ingestion pipeline. */
export function listAdapterKeys(): string[] {
  return Object.keys(registry)
}
