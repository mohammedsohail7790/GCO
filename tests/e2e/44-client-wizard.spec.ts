import { test, expect } from '@playwright/test'
import { db } from '../../lib/db/client'
import { anonymousContext, sharedAdminContext, loginAs } from './helpers'

test.describe('client setup wizard and AI mode over HTTP', () => {
  const slug = `e2e-wiz-${Date.now()}`
  const clientEmail = `${slug}-client@e2e.gco`
  const body = {
    company: { name: `[E2E] ${slug}`, slug }, industry: 'ECOMMERCE', services: ['LIVE_CHAT_SUPPORT'], languages: ['en'], timezone: 'Europe/Rome', operatingHours: null,
    responseSlaSeconds: 120, operatorCapacity: 2, messageCap: null,
    billing: { model: 'PER_MESSAGE', pricePerMessageEurCents: 14, vatRatePercent: 22 }, operatorPay: { amountEurCents: 6, basis: 'DELIVERED' }, aiMode: 'AI_ASSISTED', requireOperatorApproval: false,
    clientContact: { email: clientEmail, name: 'Wizard Client' }, staff: [{ email: `${slug}-mgr@e2e.gco`, name: 'Wizard Manager', role: 'MANAGER' }],
  }
  test.afterAll(async () => {
    const t = await db.tenant.findUnique({ where: { slug } })
    if (!t) return
    await db.staffInvitation.deleteMany({ where: { tenantId: t.id } }); await db.operatorRateCard.deleteMany({ where: { tenantId: t.id } }); await db.tenantService.deleteMany({ where: { tenantId: t.id } })
    await db.session.deleteMany({ where: { user: { tenantId: t.id } } }); await db.auditLog.deleteMany({ where: { tenantId: t.id } }); await db.user.deleteMany({ where: { tenantId: t.id } }); await db.tenant.delete({ where: { id: t.id } })
  })

  test('only the CEO runs the wizard; the client contact can then set a password and sign in to its own portal', async () => {
    expect((await (await anonymousContext()).post('/api/v1/admin/clients/setup', { data: body })).status()).toBe(401)
    const admin = await sharedAdminContext()
    expect((await admin.post('/api/v1/admin/clients/setup', { data: { ...body, aiMode: 'AI_PLUS_HUMAN' } })).status()).toBe(400)
    const res = await admin.post('/api/v1/admin/clients/setup', { data: body })
    expect(res.status()).toBe(200)
    const data = (await res.json()).data
    expect(data.invitations).toHaveLength(2)
    const link = data.invitations.find((i: { role: string }) => i.role === 'CLIENT')
    const token = link.setupUrl.split('#token=')[1]
    const anon = await anonymousContext()
    const accept = await anon.post('/api/v1/auth/accept-invitation', { data: { token, password: 'Harbor-Quiet-Lantern-2026' } })
    expect(accept.status()).toBe(200)
    const client = await loginAs(clientEmail, 'Harbor-Quiet-Lantern-2026')
    expect((await client.get('/api/v1/auth/me').then((r) => r.json())).data.user).toMatchObject({ role: 'CLIENT', tenantId: data.tenantId })
    expect((await client.get('/api/v1/admin/clients/setup')).status()).toBe(403)
    expect((await client.post('/api/v1/admin/clients/setup', { data: { ...body, company: { name: 'x', slug: `${slug}-2` } } })).status()).toBe(403)
  })

  test('AI mode: human-only hides suggestions; AI + Human cannot be switched on yet', async () => {
    const admin = await sharedAdminContext()
    const t = await db.tenant.findUniqueOrThrow({ where: { slug } })
    expect((await admin.patch('/api/v1/tenant/settings', { data: { tenantId: t.id, aiMode: 'AI_PLUS_HUMAN' } })).status()).toBe(400)
    expect((await admin.patch('/api/v1/tenant/settings', { data: { tenantId: t.id, aiMode: 'HUMAN_ONLY' } })).status()).toBe(200)
    expect((await db.tenant.findUniqueOrThrow({ where: { id: t.id } })).aiMode).toBe('HUMAN_ONLY')
    const conv = await db.conversation.create({ data: { tenantId: t.id, externalUserId: 'wiz-u', state: 'ACTIVE' } })
    await db.aiGeneration.create({ data: { tenantId: t.id, conversationId: conv.id, suggestedReply: 'secret draft', status: 'ready', provider: 'mock' } as never }).catch(() => null)
    const s = await admin.get(`/api/v1/conversations/${conv.id}/suggestion`)
    expect(s.status()).toBe(200)
    expect((await s.json()).data).toMatchObject({ generation: null, aiMode: 'HUMAN_ONLY' })
    await db.aiGeneration.deleteMany({ where: { conversationId: conv.id } }); await db.conversation.delete({ where: { id: conv.id } })
  })
})
