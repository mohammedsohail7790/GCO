import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { getTenantServices, setTenantServices } from '@/lib/tenant/services'

describe('tenant services: entitlements and industry templates', () => {
  let a: string
  let b: string
  beforeAll(async () => {
    const base = `ts-${Date.now()}`
    a = (await db.tenant.create({ data: { name: '[TEST] Svc A', slug: `${base}-a` } })).id
    b = (await db.tenant.create({ data: { name: '[TEST] Svc B', slug: `${base}-b`, defaultResponseSlaSeconds: 90 } })).id
  })
  afterAll(async () => {
    for (const t of [a, b]) {
      await db.auditLog.deleteMany({ where: { tenantId: t } })
      await db.tenantService.deleteMany({ where: { tenantId: t } })
      await db.tenant.delete({ where: { id: t } })
    }
  })

  it('activates several services at once and resolves the workspace', async () => {
    const v = await setTenantServices({ tenantId: a, industry: 'GAMING', services: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'], actorUserId: null })
    expect(v.industry).toBe('GAMING')
    expect(v.services.filter((s) => s.enabled).map((s) => s.serviceType).sort()).toEqual(['CHAT_MODERATION', 'COMMUNITY_MODERATION'])
    expect(v.workspace.modules).toContain('community_reports')
  })

  it('is idempotent and switches removed services off without deleting them', async () => {
    await setTenantServices({ tenantId: a, industry: 'GAMING', services: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'], actorUserId: null })
    const v = await setTenantServices({ tenantId: a, industry: 'GAMING', services: ['CHAT_MODERATION'], actorUserId: null })
    expect(v.services).toHaveLength(2)
    expect(v.services.find((s) => s.serviceType === 'COMMUNITY_MODERATION')!.enabled).toBe(false)
    expect(v.workspace.modules).not.toContain('community_reports')
  })

  it('applies industry SLA/capacity only to a tenant still on the defaults', async () => {
    await setTenantServices({ tenantId: a, industry: 'GAMING', services: ['CHAT_MODERATION'], actorUserId: null, applyIndustryDefaults: true })
    await setTenantServices({ tenantId: b, industry: 'GAMING', services: ['CHAT_MODERATION'], actorUserId: null, applyIndustryDefaults: true })
    const [ta, tb] = await Promise.all([db.tenant.findUnique({ where: { id: a } }), db.tenant.findUnique({ where: { id: b } })])
    expect(ta!.defaultResponseSlaSeconds).toBe(60)
    expect(ta!.defaultOperatorCapacity).toBe(4)
    expect(tb!.defaultResponseSlaSeconds).toBe(90) // tuned tenant untouched
  })

  it('keeps tenants separate and audits the change', async () => {
    expect((await getTenantServices(b))!.services.map((s) => s.serviceType)).toEqual(['CHAT_MODERATION'])
    const log = await db.auditLog.findFirst({ where: { tenantId: a, action: 'tenant.services_changed' } })
    expect(log).not.toBeNull()
  })
})
