import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { db } from '@/lib/db/client'
import {
  createLead, claimLead, releaseLead, releaseExpiredLeads, changeStage, recordRepeatInquiry,
  LeadDuplicateError, LeadConflictError, InvalidStageTransitionError, normalizeEmail, normalizeVatId,
} from '@/lib/crm/leads'
import { submitForApproval, decideApproval, confirmFirstPayment, ApprovalError, PaymentConfirmationError } from '@/lib/crm/approvals'

// Operational chain on the real database: duplicate normalisation, 30-day lock sweep, stage/approval races,
// stale approvals, and atomic first-payment -> exactly-one-commission. No queue/worker is involved: the
// BPO handoff state is set up directly so these run without Redis timing.
describe('CRM operational chain', () => {
  const base = `chain-${Date.now()}`
  const leadIds: string[] = []
  const tenantIds: string[] = []
  let hunter: string, other: string, manager: string

  const mkLead = async (tag: string, extra: Record<string, unknown> = {}) => {
    const { lead } = await createLead({ companyName: `[TEST] ${tag}`, contactName: 'T', email: `${base}-${tag}@test.gco`, actorUserId: hunter })
    leadIds.push(lead.id)
    if (Object.keys(extra).length) await db.lead.update({ where: { id: lead.id }, data: extra as any })
    return lead
  }
  const user = (tag: string, role: 'HUNTER' | 'MANAGER') =>
    db.user.create({ data: { email: `${base}-${tag}@test.gco`, passwordHash: 'x', role, displayName: `[TEST] ${tag}` } }).then((u) => u.id)

  beforeAll(async () => {
    hunter = await user('hunter', 'HUNTER')
    other = await user('other', 'HUNTER')
    manager = await user('manager', 'MANAGER')
  })
  afterAll(async () => {
    await db.revenueRecord.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.commission.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.approval.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.bpoHandoff.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: leadIds } } })
    await db.lead.deleteMany({ where: { id: { in: leadIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: [hunter, other, manager] } } })
  })

  describe('duplicate normalisation', () => {
    it('normalisers', () => {
      expect(normalizeEmail('  Jane@Acme.COM ')).toBe('jane@acme.com')
      expect(normalizeVatId('it 123.456-789')).toBe('IT123456789')
    })
    it('an email differing only by case is a hard duplicate; stored lower-case', async () => {
      const l = await mkLead('Case')
      expect(l.email).toBe(`${base}-case@test.gco`)
      await expect(createLead({ companyName: 'X', contactName: 'X', email: `${base}-CASE@TEST.GCO`, actorUserId: hunter })).rejects.toBeInstanceOf(LeadDuplicateError)
    })
    it('a VAT ID differing only by case/spacing is a hard duplicate', async () => {
      const { lead } = await createLead({ companyName: 'V', contactName: 'V', email: `${base}-vat1@test.gco`, vatId: `${base}-it 77`, actorUserId: hunter })
      leadIds.push(lead.id)
      expect(lead.vatId).toBe(`${base}-IT77`.replace(/[\s.\-]/g, '').toUpperCase())
      await expect(createLead({ companyName: 'V2', contactName: 'V', email: `${base}-vat2@test.gco`, vatId: `${base}-IT.77`, actorUserId: hunter })).rejects.toBeInstanceOf(LeadDuplicateError)
    })
    it('a repeat pilot submission with different email casing lands on the ORIGINAL lead', async () => {
      const l = await mkLead('Repeat')
      const r = await recordRepeatInquiry({ email: `${base}-REPEAT@Test.Gco`, kind: 'pilot', submittedCompany: 'Same Co', fields: {} })
      expect(r?.leadId).toBe(l.id)
      expect(await db.lead.count({ where: { email: { equals: l.email, mode: 'insensitive' } } })).toBe(1)
    })
  })

  describe('30-day lead lock', () => {
    const past = () => new Date(Date.now() - 60_000)
    it('claim sets a 30-day lock; the sweep releases an expired OPEN lead with an auditable history entry', async () => {
      const l = await mkLead('Sweep')
      const claimed = await claimLead(l.id, hunter)
      const days = (claimed.ownershipExpiresAt!.getTime() - claimed.ownershipStartedAt!.getTime()) / 86_400_000
      expect(Math.round(days)).toBe(30)
      await db.lead.update({ where: { id: l.id }, data: { ownershipExpiresAt: past() } })
      await releaseExpiredLeads()
      const after = await db.lead.findUniqueOrThrow({ where: { id: l.id } })
      expect(after.ownerId).toBeNull()
      expect(after.ownershipExpiresAt).toBeNull()
      expect(await db.leadHistoryEntry.count({ where: { leadId: l.id, action: 'auto_released', actorUserId: null } })).toBe(1)
    })
    it('an unexpired lock is never released', async () => {
      const l = await mkLead('Fresh')
      await claimLead(l.id, hunter)
      await releaseExpiredLeads()
      expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).ownerId).toBe(hunter)
    })
    it('PENDING_APPROVAL and CLOSED_WON leads are NEVER auto-released (the commission needs the owner)', async () => {
      for (const stage of ['PENDING_APPROVAL', 'CLOSED_WON'] as const) {
        const l = await mkLead(`Protected-${stage}`, { ownerId: hunter, pipelineStage: stage, ownershipStartedAt: past(), ownershipExpiresAt: past() })
        await releaseExpiredLeads()
        expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).ownerId, stage).toBe(hunter)
      }
    })
    it('manual release of a won or pending lead is refused', async () => {
      for (const stage of ['PENDING_APPROVAL', 'CLOSED_WON'] as const) {
        const l = await mkLead(`Manual-${stage}`, { ownerId: hunter, pipelineStage: stage })
        await expect(releaseLead(l.id, hunter, 'released')).rejects.toBeInstanceOf(LeadConflictError)
      }
    })
    it('a released lead can be claimed by a different Hunter; only one of two racing claims wins', async () => {
      const l = await mkLead('Reclaim')
      const results = await Promise.allSettled([claimLead(l.id, hunter), claimLead(l.id, other)])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    })
  })

  describe('pipeline integrity', () => {
    const toProposal = async (tag: string) => {
      const l = await mkLead(tag, { ownerId: hunter, pipelineStage: 'PROPOSAL' })
      return l
    }
    it('no stage can jump to CLOSED_WON through changeStage', async () => {
      for (const from of ['NEW', 'PROPOSAL', 'PENDING_APPROVAL'] as const) {
        const l = await mkLead(`Jump-${from}`, { ownerId: hunter, pipelineStage: from })
        await expect(changeStage(l.id, hunter, 'CLOSED_WON')).rejects.toBeInstanceOf(InvalidStageTransitionError)
      }
    })
    it('concurrent submit-for-approval creates exactly one approval', async () => {
      const l = await toProposal('Submit')
      const res = await Promise.allSettled(Array.from({ length: 6 }, () => submitForApproval(l.id, hunter)))
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(await db.approval.count({ where: { leadId: l.id } })).toBe(1)
    })
    it('a Hunter cannot submit another Hunter\'s lead', async () => {
      const l = await toProposal('Foreign')
      await expect(submitForApproval(l.id, other)).rejects.toMatchObject({ status: 403 })
    })
    it('stale approval: walked-back lead cannot be approved into Closed Won; no handoff is created', async () => {
      const l = await toProposal('Stale')
      const a = await submitForApproval(l.id, hunter)
      await changeStage(l.id, hunter, 'PROPOSAL') // Hunter walks the lead back
      await expect(decideApproval(a.id, manager, 'APPROVED', undefined)).rejects.toMatchObject({ status: 409 })
      expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).pipelineStage).toBe('PROPOSAL')
      expect(await db.bpoHandoff.count({ where: { leadId: l.id } })).toBe(0)
      expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('PENDING') // rolled back, can still be rejected
      await decideApproval(a.id, manager, 'REJECTED', 'stale')
      expect((await db.approval.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('REJECTED')
    })
    it('stale approval: a CLOSED_LOST lead is never resurrected as Closed Won', async () => {
      const l = await toProposal('Lost')
      const a = await submitForApproval(l.id, hunter)
      await changeStage(l.id, hunter, 'CLOSED_LOST')
      await expect(decideApproval(a.id, manager, 'APPROVED', undefined)).rejects.toBeInstanceOf(ApprovalError)
      expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).pipelineStage).toBe('CLOSED_LOST')
    })
    it('approve is atomic and creates NO commission and exactly one handoff record; concurrent decides -> one wins', async () => {
      const l = await toProposal('Approve')
      const a = await submitForApproval(l.id, hunter)
      const res = await Promise.allSettled(Array.from({ length: 5 }, () => decideApproval(a.id, manager, 'APPROVED', undefined)))
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect((await db.lead.findUniqueOrThrow({ where: { id: l.id } })).pipelineStage).toBe('CLOSED_WON')
      expect(await db.bpoHandoff.count({ where: { leadId: l.id } })).toBe(1)
      expect(await db.commission.count({ where: { leadId: l.id } })).toBe(0)
      expect(await db.revenueRecord.count({ where: { leadId: l.id } })).toBe(0)
    })
  })

  describe('first payment -> commission (atomic, exactly once)', () => {
    const wonLead = async (tag: string, handoff: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'none') => {
      const l = await mkLead(tag, { ownerId: hunter, pipelineStage: 'CLOSED_WON' })
      if (handoff !== 'none') {
        let tenantId: string | undefined
        if (handoff === 'SUCCEEDED') {
          const t = await db.tenant.create({ data: { name: `[TEST] ${tag}`, slug: `${base}-${tag}`.toLowerCase() } })
          tenantIds.push(t.id)
          tenantId = t.id
        }
        await db.bpoHandoff.create({ data: { leadId: l.id, eventId: `h-${l.id}`, payload: {}, status: handoff, tenantId } })
      }
      return l
    }
    it('refused before Closed Won, with no owner, and while the BPO handoff has not succeeded', async () => {
      const notWon = await mkLead('NotWon', { ownerId: hunter })
      await expect(confirmFirstPayment(notWon.id, manager, 100_000)).rejects.toBeInstanceOf(PaymentConfirmationError)
      for (const h of ['none', 'PENDING', 'FAILED'] as const) {
        const l = await wonLead(`NoHandoff-${h}`, h)
        await expect(confirmFirstPayment(l.id, manager, 100_000), h).rejects.toMatchObject({ status: 409 })
        expect(await db.commission.count({ where: { leadId: l.id } })).toBe(0)
      }
    })
    it('a released/ownerless Closed Won lead cannot generate a commission', async () => {
      const l = await wonLead('Ownerless', 'SUCCEEDED')
      await db.lead.update({ where: { id: l.id }, data: { ownerId: null } })
      await expect(confirmFirstPayment(l.id, manager, 100_000)).rejects.toMatchObject({ status: 409 })
    })
    it('creates exactly one 10% commission and one matching revenue record, regardless of a stored 25% Hunter rate', async () => {
      await db.hunterProfile.upsert({ where: { userId: hunter }, update: { commissionPercentage: 25 }, create: { userId: hunter, commissionPercentage: 25 } })
      const l = await wonLead('Pay', 'SUCCEEDED')
      const { commission, revenueRecord } = await confirmFirstPayment(l.id, manager, 123_456)
      expect(Number(commission.percentage)).toBe(10)
      expect(commission.amountEurCents).toBe(12_346) // round(123456 * 10%)
      expect(commission.revenueBasisEurCents).toBe(123_456)
      expect(commission.status).toBe('PENDING')
      expect(commission.hunterId).toBe(hunter)
      expect(revenueRecord.amountEurCents).toBe(123_456)
      expect(revenueRecord.tenantId).toBe(commission.tenantId)
      expect(revenueRecord.leadId).toBe(l.id)
      await db.hunterProfile.deleteMany({ where: { userId: hunter } })
    })
    it('commission is on the amount actually collected, not any other figure', async () => {
      const l = await wonLead('Basis', 'SUCCEEDED')
      await db.lead.update({ where: { id: l.id }, data: { estimatedValueEurCents: 9_000_000 } })
      const { commission } = await confirmFirstPayment(l.id, manager, 50_000)
      expect(commission.amountEurCents).toBe(5_000)
    })
    it('duplicate and concurrent confirmations: one commission, one revenue record, one history entry', async () => {
      const l = await wonLead('Race', 'SUCCEEDED')
      const res = await Promise.allSettled(Array.from({ length: 8 }, () => confirmFirstPayment(l.id, manager, 80_000)))
      expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      for (const r of res) if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 409 })
      await expect(confirmFirstPayment(l.id, manager, 80_000)).rejects.toMatchObject({ status: 409 })
      expect(await db.commission.count({ where: { leadId: l.id } })).toBe(1)
      expect(await db.revenueRecord.count({ where: { leadId: l.id } })).toBe(1)
      expect(await db.leadHistoryEntry.count({ where: { leadId: l.id, action: 'first_payment_confirmed' } })).toBe(1)
    })
    it('a losing/failed confirmation leaves nothing behind (no orphan revenue or history)', async () => {
      const l = await wonLead('Atomic', 'SUCCEEDED')
      await confirmFirstPayment(l.id, manager, 10_000)
      await expect(confirmFirstPayment(l.id, manager, 99_999)).rejects.toBeInstanceOf(PaymentConfirmationError)
      const rev = await db.revenueRecord.findMany({ where: { leadId: l.id } })
      expect(rev.map((r) => r.amountEurCents)).toEqual([10_000])
    })
  })
})
