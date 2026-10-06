import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isProductionAdapter, listProductionAdapterKeys, listAdapterKeys, getAdapter, supportsVerification } from '@/lib/integrations/registry'

describe('adapter registry production gate', () => {
  const saved = process.env.ALLOW_DEV_ADAPTERS
  beforeEach(() => {
    delete process.env.ALLOW_DEV_ADAPTERS // hermetic: independent of how the suite was launched
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_DEV_ADAPTERS
    else process.env.ALLOW_DEV_ADAPTERS = saved
  })
  it('production capability is an explicit adapter property, not inferred from registration', () => {
    expect(listAdapterKeys().sort()).toEqual(['dev-mock', 'gco-webhook'])
    expect(getAdapter('dev-mock').productionCapable).toBe(false)
    expect(getAdapter('gco-webhook').productionCapable).toBe(true)
    expect(isProductionAdapter('dev-mock')).toBe(false)
    expect(isProductionAdapter('gco-webhook')).toBe(true)
    expect(listProductionAdapterKeys()).toEqual(['gco-webhook'])
    for (const k of listAdapterKeys()) expect(typeof getAdapter(k).productionCapable, k).toBe('boolean') // every adapter must declare it
  })
  it('only gco-webhook supports verification', () => {
    expect(supportsVerification('gco-webhook')).toBe(true)
    expect(supportsVerification('dev-mock')).toBe(false)
    expect(supportsVerification('nope')).toBe(false)
  })
  it('only the exact test flag value "true" opens it; unknown adapters never qualify', () => {
    for (const v of ['1', 'yes', 'TRUE', '']) {
      process.env.ALLOW_DEV_ADAPTERS = v
      expect(isProductionAdapter('dev-mock'), v).toBe(false)
    }
    process.env.ALLOW_DEV_ADAPTERS = 'true'
    expect(isProductionAdapter('dev-mock')).toBe(true)
    expect(listProductionAdapterKeys().sort()).toEqual(['dev-mock', 'gco-webhook'])
    expect(isProductionAdapter('made-up')).toBe(false)
  })
})
