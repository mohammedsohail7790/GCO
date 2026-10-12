import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { seedStaging, resetStagingActivity } from '@/lib/staging/seed'

describe('staging seed (real database, isolated copy)', () => {
  const suffix = `-t${Date.now()}`
  const tenantIds: string[] = []
  afterAll(async () => {
    await resetStagingActivity(db, tenantIds)
    await db.integration.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('creates three separate clients with their own teams, languages, settings and a simulated platform; is idempotent', async () => {
    const r1 = await seedStaging(db, { passwordHash: 'x', suffix, history: true })
    tenantIds.push(...r1.tenants.map((t) => t.tenantId))
    expect(r1.tenants).toHaveLength(3)
    const r2 = await seedStaging(db, { passwordHash: 'x', suffix, history: true })
    expect(r2.tenants.map((t) => t.tenantId)).toEqual(r1.tenants.map((t) => t.tenantId)) // no duplicates on re-run

    const slas = new Set<number>()
    for (const t of r1.tenants) {
      const tenant = await db.tenant.findUniqueOrThrow({ where: { id: t.tenantId } })
      slas.add(tenant.defaultResponseSlaSeconds)
      const ops = await db.operator.findMany({ where: { tenantId: t.tenantId }, include: { user: true } })
      expect(ops).toHaveLength(3)
      for (const o of ops) { expect(o.user.tenantId).toBe(t.tenantId); expect(o.languages.length).toBeGreaterThan(0) }
      expect(ops.some((o) => o.status === 'AVAILABLE')).toBe(true)
      expect(await db.user.count({ where: { tenantId: t.tenantId, role: 'MANAGER' } })).toBe(1)
      expect(await db.user.count({ where: { tenantId: t.tenantId, role: 'CLIENT' } })).toBe(1)
      const integ = await db.integration.findMany({ where: { tenantId: t.tenantId } })
      expect(integ).toHaveLength(1)
      expect(integ[0]).toMatchObject({ adapterKey: 'dev-mock', status: 'ACTIVE' })
      expect(integ[0]!.webhookSecret).toMatch(/^[0-9a-f]{48}$/)
      expect(await db.conversation.count({ where: { tenantId: t.tenantId } })).toBe(2)
    }
    expect(slas.size).toBeGreaterThan(1)
    // each client has its own secret
    const secrets = (await db.integration.findMany({ where: { tenantId: { in: tenantIds } } })).map((i) => i.webhookSecret)
    expect(new Set(secrets).size).toBe(3)
  })

  it('reset clears conversations but keeps accounts, teams and settings', async () => {
    await resetStagingActivity(db, tenantIds)
    for (const id of tenantIds) {
      expect(await db.conversation.count({ where: { tenantId: id } })).toBe(0)
      expect(await db.operator.count({ where: { tenantId: id } })).toBe(3)
      expect(await db.integration.count({ where: { tenantId: id } })).toBe(1)
    }
  })
})
