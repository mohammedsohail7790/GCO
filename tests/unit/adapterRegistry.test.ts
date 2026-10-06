import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isProductionAdapter, listProductionAdapterKeys, listAdapterKeys } from '@/lib/integrations/registry'

describe('adapter registry production gate', () => {
  const saved = process.env.ALLOW_DEV_ADAPTERS
  beforeEach(() => {
    delete process.env.ALLOW_DEV_ADAPTERS // hermetic: independent of how the suite was launched
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_DEV_ADAPTERS
    else process.env.ALLOW_DEV_ADAPTERS = saved
  })
  it('dev-mock is the only registered adapter and is NOT production-capable by default', () => {
    expect(listAdapterKeys()).toEqual(['dev-mock'])
    expect(isProductionAdapter('dev-mock')).toBe(false)
    expect(listProductionAdapterKeys()).toEqual([])
  })
  it('only the exact test flag value "true" opens it; unknown adapters never qualify', () => {
    for (const v of ['1', 'yes', 'TRUE', '']) {
      process.env.ALLOW_DEV_ADAPTERS = v
      expect(isProductionAdapter('dev-mock'), v).toBe(false)
    }
    process.env.ALLOW_DEV_ADAPTERS = 'true'
    expect(isProductionAdapter('dev-mock')).toBe(true)
    expect(isProductionAdapter('made-up')).toBe(false)
  })
})
