import { describe, it, expect, vi, afterAll } from 'vitest'

// Queue (Redis) outage right after a Closed-Won approval: the decision must still stand, the handoff stays
// recoverable (PENDING row), and the failure is visible as a SystemEvent.
vi.mock('@/lib/queue/jobs', () => ({ enqueueBpoHandoff: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED redis')) }))

import { db } from '@/lib/db/client'
import { createLead } from '@/lib/crm/leads'
import { submitForApproval, decideApproval } from '@/lib/crm/approvals'

describe('BPO handoff when the queue is unavailable', () => {
  const base = `enq-${Date.now()}`
  const ids: { hunter?: string; manager?: string; lead?: string } = {}
  afterAll(async () => {
    if (ids.lead) {
      await db.bpoHandoff.deleteMany({ where: { leadId: ids.lead } })
      await db.approval.deleteMany({ where: { leadId: ids.lead } })
      await db.leadHistoryEntry.deleteMany({ where: { leadId: ids.lead } })
      await db.lead.delete({ where: { id: ids.lead } }).catch(() => null)
    }
    await db.systemEvent.deleteMany({ where: { metadata: { path: ['leadId'], equals: ids.lead } } })
    await db.user.deleteMany({ where: { id: { in: [ids.hunter!, ids.manager!].filter(Boolean) } } })
  })

  it('approval commits, handoff stays PENDING, a SystemEvent is recorded, and no error escapes', async () => {
    ids.hunter = (await db.user.create({ data: { email: `${base}-h@test.gco`, passwordHash: 'x', role: 'HUNTER', displayName: '[TEST] h' } })).id
    ids.manager = (await db.user.create({ data: { email: `${base}-m@test.gco`, passwordHash: 'x', role: 'MANAGER', displayName: '[TEST] m' } })).id
    const { lead } = await createLead({ companyName: '[TEST] Enq', contactName: 'E', email: `${base}@test.gco`, actorUserId: ids.hunter })
    ids.lead = lead.id
    await db.lead.update({ where: { id: lead.id }, data: { ownerId: ids.hunter, pipelineStage: 'PROPOSAL' } })
    const a = await submitForApproval(lead.id, ids.hunter)

    await expect(decideApproval(a.id, ids.manager, 'APPROVED', undefined)).resolves.toBeTruthy()

    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).pipelineStage).toBe('CLOSED_WON')
    expect((await db.bpoHandoff.findUniqueOrThrow({ where: { leadId: lead.id } })).status).toBe('PENDING')
    const ev = await db.systemEvent.findFirst({ where: { category: 'queue', metadata: { path: ['leadId'], equals: lead.id } } })
    expect(ev?.message).toMatch(/could not be enqueued/)
    expect(JSON.stringify(ev?.metadata)).not.toMatch(/password|secret/i)
  })
})
