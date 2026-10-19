import { describe, it, expect } from 'vitest'
import { INDUSTRY_TEMPLATES, SERVICE_MODULES, MODULES, resolveWorkspace } from '@/lib/tenant/templates'

describe('workspace templates', () => {
  it('every service and industry module exists in the module table', () => {
    for (const mods of Object.values(SERVICE_MODULES)) for (const m of mods) expect(MODULES[m]).toBeDefined()
    for (const t of Object.values(INDUSTRY_TEMPLATES)) for (const m of t.extraModules) expect(MODULES[m]).toBeDefined()
  })

  it('no services means no modules, whatever the industry', () => {
    expect(resolveWorkspace('DATING', []).modules).toEqual([])
  })

  it('purchased services decide the modules; the industry only adds to them', () => {
    const plain = resolveWorkspace(null, ['LIVE_CHAT_SUPPORT'])
    const shop = resolveWorkspace('ECOMMERCE', ['LIVE_CHAT_SUPPORT'])
    expect(plain.modules).not.toContain('customer_records')
    expect(shop.modules).toContain('customer_records')
    expect(shop.modules).not.toContain('moderation_queue')
  })

  it('several services combine without duplicates', () => {
    const w = resolveWorkspace('GAMING', ['CHAT_MODERATION', 'COMMUNITY_MODERATION'])
    expect(new Set(w.modules).size).toBe(w.modules.length)
    expect(w.modules).toEqual(expect.arrayContaining(['moderation_queue', 'community_reports']))
  })

  it('separates built modules from planned ones so nothing unbuilt is presented as live', () => {
    const w = resolveWorkspace('ECOMMERCE', ['LIVE_CHAT_SUPPORT'])
    expect(w.availableModules).toContain('conversations')
    expect(w.plannedModules).toContain('customer_records')
    expect([...w.availableModules, ...w.plannedModules].sort()).toEqual(w.modules)
  })
})
