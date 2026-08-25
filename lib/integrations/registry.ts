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
