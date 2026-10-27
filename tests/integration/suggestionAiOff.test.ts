import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'

// Regression: a draft stored while AI was on must never reach the operator panel once the AI master switch is off.
let sessionTenantId = ''
vi.mock('@/lib/api/guard', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/guard')>()),
  requirePermission: vi.fn(async () => ({ userId: 'u', role: 'OPERATOR', tenantId: sessionTenantId })),
}))

describe('GET /conversations/:id/suggestion with a stored AI draft', () => {
  const base = `sg-${Date.now()}`
  let tenantId = ''
  let convId = ''
  const saved = process.env.AI_MASTER_SWITCH
  const call = async () => {
    const { GET } = await import('@/app/api/v1/conversations/[id]/suggestion/route')
    const res = await GET(new NextRequest(`http://localhost/api/v1/conversations/${convId}/suggestion`), { params: Promise.resolve({ id: convId }) })
    return (await res.json()) as { data?: { generation: { suggestedReply: string } | null; aiMode?: string } }
  }
  beforeAll(async () => {
    tenantId = (await db.tenant.create({ data: { name: `[TEST] ${base}`, slug: base } })).id
    sessionTenantId = tenantId
    convId = (await db.conversation.create({ data: { tenantId, externalUserId: `${base}-u`, state: 'ACTIVE' } })).id
    const m = await db.message.create({ data: { tenantId, conversationId: convId, direction: 'INBOUND', status: 'RECEIVED', content: 'hello', externalMessageId: `${base}-m` } })
    void m
    await db.aiGeneration.create({ data: { tenantId, conversationId: convId, provider: 'mock', model: 'mock', status: 'generated', suggestedReply: 'STORED DRAFT', language: 'en', confidence: 0.9, requiresReview: false, flags: [] } })
  })
  afterAll(async () => {
    if (saved === undefined) delete process.env.AI_MASTER_SWITCH; else process.env.AI_MASTER_SWITCH = saved
    await db.aiGeneration.deleteMany({ where: { tenantId } }); await db.message.deleteMany({ where: { tenantId } })
    await db.conversation.deleteMany({ where: { tenantId } }); await db.tenant.delete({ where: { id: tenantId } })
  })

  it('AI switch off: returns no draft even though one is stored', async () => {
    delete process.env.AI_MASTER_SWITCH
    const body = await call()
    expect(body.data?.generation).toBeNull()
    expect(JSON.stringify(body)).not.toContain('STORED DRAFT')
  })

  it('control: AI switch on and an AI-assisted client: the stored draft is served', async () => {
    process.env.AI_MASTER_SWITCH = 'enabled'
    const body = await call()
    expect(body.data?.generation?.suggestedReply).toBe('STORED DRAFT')
  })
})
