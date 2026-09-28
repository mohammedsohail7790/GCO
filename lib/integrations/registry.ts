import type { IntegrationAdapter } from './adapter'
import { DevMockAdapter } from './adapters/devMock'

const registry: Record<string, IntegrationAdapter> = {
  'dev-mock': new DevMockAdapter(),
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
