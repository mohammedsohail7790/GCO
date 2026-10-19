import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { syncEarnings, createRateCard, createAdjustment, createPayout, markPayoutPaid, EarningsError } from '@/lib/earnings/ledger'
import { getEarningsSummary } from '@/lib/earnings/summary'

describe('operator earnings ledger (real database)', () => {
  const base = `el-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const mkTenant = async (tag: string) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}` } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string, tag: string, role: 'OPERATOR' | 'CEO_ADMIN' = 'OPERATOR') => {
    const u = await db.user.create({ data: { email: `${base}-${tenantId.slice(-8)}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } })
    userIds.push(u.id)
    return u.id
  }
  const mkOp = async (tenantId: string, tag: string) => (await db.operator.create({ data: { userId: await mkUser(tenantId, tag), tenantId, status: 'AVAILABLE' } })).id
  const mkConv = (tenantId: string, tag: string) => db.conversation.create({ data: { tenantId, externalUserId: `${base}-${tag}`, state: 'ACTIVE' } }).then((c) => c.id)
  const msg = async (tenantId: string, conversationId: string, operatorId: string, status: 'SENT' | 'DELIVERED' | 'FAILED', createdAt = new Date()) =>
    (await db.message.create({ data: { tenantId, conversationId, direction: 'OUTBOUND', status, content: 'hi', operatorId, externalMessageId: `${base}-${Math.random()}`, createdAt } })).id

  afterAll(async () => {
    const ops = (await db.operator.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((o) => o.id)
    await db.operatorPayout.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorEarningAdjustment.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorEarningLine.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorRateCard.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { operatorId: { in: ops } }] } })
    await db.qaReview.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('messages with no rate are reported as unrated - not priced at zero, not lost - and priced once a rate applies', async () => {
    const t = await mkTenant('unrated'); const op = await mkOp(t, 'op1'); const c = await mkConv(t, 'c')
    const admin = await mkUser(t, 'admin', 'CEO_ADMIN')
    await msg(t, c, op, 'DELIVERED')
    expect(await syncEarnings(op)).toMatchObject({ created: 0, unrated: 1 })
    expect((await getEarningsSummary(op)).messages.unrated).toBe(1)
    await createRateCard({ tenantId: t, amountEurCents: 7, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 86_400_000), actorUserId: admin })
    expect(await syncEarnings(op)).toMatchObject({ created: 1, unrated: 0 })
    const s = await getEarningsSummary(op)
    expect(s.earnings.totalAccumulatedEurCents).toBe(7)
    expect(s.messages.unrated).toBe(0)
  })

  it('sync is idempotent; a later rate change never reprices earlier messages', async () => {
    const t = await mkTenant('hist'); const op = await mkOp(t, 'op'); const c = await mkConv(t, 'c')
    const admin = await mkUser(t, 'admin', 'CEO_ADMIN')
    const day = 86_400_000
    await createRateCard({ tenantId: t, amountEurCents: 5, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 10 * day), actorUserId: admin })
    await msg(t, c, op, 'DELIVERED', new Date(Date.now() - 5 * day))
    await syncEarnings(op); await syncEarnings(op)
    await createRateCard({ tenantId: t, amountEurCents: 9, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 2 * day), actorUserId: admin })
    await msg(t, c, op, 'DELIVERED', new Date(Date.now() - 1 * day))
    await syncEarnings(op); await syncEarnings(op)
    const lines = await db.operatorEarningLine.findMany({ where: { operatorId: op }, orderBy: { messageAt: 'asc' } })
    expect(lines.map((l) => l.rateEurCents)).toEqual([5, 9])
  })

  it('pending turns payable on delivery; the APPROVED basis needs a review; a failed review rejects', async () => {
    const t = await mkTenant('state'); const op = await mkOp(t, 'op'); const c = await mkConv(t, 'c')
    const admin = await mkUser(t, 'admin', 'CEO_ADMIN')
    await createRateCard({ tenantId: t, amountEurCents: 10, basis: 'APPROVED', effectiveFrom: new Date(Date.now() - 86_400_000), actorUserId: admin })
    const sent = await msg(t, c, op, 'SENT'); const deliveredNoReview = await msg(t, c, op, 'DELIVERED'); const reviewedPass = await msg(t, c, op, 'DELIVERED'); const reviewedFail = await msg(t, c, op, 'DELIVERED'); const failed = await msg(t, c, op, 'FAILED')
    for (const [m, outcome] of [[reviewedPass, 'PASS'], [reviewedFail, 'FAIL']] as const) {
      await db.qaReview.create({ data: { tenantId: t, conversationId: c, messageId: m, operatorId: op, reviewerUserId: admin, accuracy: 3, tone: 3, resolution: 3, outcome } })
    }
    await syncEarnings(op)
    const st = async (m: string) => (await db.operatorEarningLine.findUnique({ where: { messageId: m } }))!.state
    expect(await st(sent)).toBe('PENDING'); expect(await st(deliveredNoReview)).toBe('PENDING')
    expect(await st(reviewedPass)).toBe('PAYABLE'); expect(await st(reviewedFail)).toBe('REJECTED'); expect(await st(failed)).toBe('REJECTED')
    // delivery and approval arrive later
    await db.message.update({ where: { id: sent }, data: { status: 'DELIVERED' } })
    await db.qaReview.create({ data: { tenantId: t, conversationId: c, messageId: sent, operatorId: op, reviewerUserId: admin, accuracy: 4, tone: 4, resolution: 4, outcome: 'PASS' } })
    expect((await syncEarnings(op)).updated).toBe(1)
    expect(await st(sent)).toBe('PAYABLE')
    const s = await getEarningsSummary(op)
    expect(s.messages).toMatchObject({ written: 5, delivered: 4, failed: 1, approved: 2, rejected: 1, payable: 2, pending: 1, notPayable: 2 })
  })

  it('payout settles payable lines and adjustments exactly once, even when requested concurrently', async () => {
    const t = await mkTenant('pay'); const op = await mkOp(t, 'op'); const c = await mkConv(t, 'c')
    const admin = await mkUser(t, 'admin', 'CEO_ADMIN')
    await createRateCard({ tenantId: t, amountEurCents: 10, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 86_400_000), actorUserId: admin })
    for (let i = 0; i < 4; i++) await msg(t, c, op, 'DELIVERED')
    await syncEarnings(op)
    await createAdjustment({ operatorId: op, amountEurCents: -15, reason: 'duplicate message corrected', actorUserId: admin })
    await createAdjustment({ operatorId: op, amountEurCents: 100, reason: 'quality bonus', actorUserId: admin })
    const results = await Promise.allSettled([createPayout({ operatorId: op, periodEnd: new Date(), actorUserId: admin }), createPayout({ operatorId: op, periodEnd: new Date(), actorUserId: admin })])
    const ok = results.filter((r) => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)
    const payout = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof createPayout>>>).value
    expect(payout).toMatchObject({ lineCount: 4, linesEurCents: 40, adjustmentsEurCents: 85, totalEurCents: 125, status: 'PENDING' })
    await expect(createPayout({ operatorId: op, periodEnd: new Date(), actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)

    let s = await getEarningsSummary(op)
    expect(s.earnings).toMatchObject({ totalAccumulatedEurCents: 125, awaitingPayoutEurCents: 0, pendingPaymentEurCents: 125, paidEurCents: 0 })
    await markPayoutPaid({ payoutId: payout.id, reference: 'SEPA-1', actorUserId: admin })
    await expect(markPayoutPaid({ payoutId: payout.id, actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)
    s = await getEarningsSummary(op)
    expect(s.earnings).toMatchObject({ pendingPaymentEurCents: 0, paidEurCents: 125 })
  })

  it('history follows the operator across projects: moving tenants keeps old lines and new tenant rates apply to new work', async () => {
    const a = await mkTenant('moveA'); const b = await mkTenant('moveB'); const op = await mkOp(a, 'op')
    const ca = await mkConv(a, 'ca'); const cb = await mkConv(b, 'cb')
    const admin = await mkUser(a, 'admin', 'CEO_ADMIN')
    const from = new Date(Date.now() - 86_400_000)
    await createRateCard({ tenantId: a, amountEurCents: 4, basis: 'DELIVERED', effectiveFrom: from, actorUserId: admin })
    await createRateCard({ tenantId: b, amountEurCents: 6, basis: 'DELIVERED', effectiveFrom: from, actorUserId: admin })
    await msg(a, ca, op, 'DELIVERED'); await syncEarnings(op)
    await db.operator.update({ where: { id: op }, data: { tenantId: b } })
    await msg(b, cb, op, 'DELIVERED'); await syncEarnings(op)
    const lines = await db.operatorEarningLine.findMany({ where: { operatorId: op }, orderBy: { createdAt: 'asc' } })
    expect(lines.map((l) => [l.tenantId === a ? 'A' : 'B', l.rateEurCents])).toEqual([['A', 4], ['B', 6]])
    expect((await getEarningsSummary(op)).earnings.totalAccumulatedEurCents).toBe(10)
  })

  it('validates inputs: rates, adjustment reasons and cross-operator lines', async () => {
    const t = await mkTenant('val'); const op = await mkOp(t, 'op'); const other = await mkOp(t, 'other')
    const admin = await mkUser(t, 'admin', 'CEO_ADMIN')
    await expect(createRateCard({ amountEurCents: -1, basis: 'DELIVERED', effectiveFrom: new Date(), actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)
    await expect(createAdjustment({ operatorId: op, amountEurCents: 0, reason: 'valid reason', actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)
    await expect(createAdjustment({ operatorId: op, amountEurCents: 5, reason: 'x', actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)
    await createRateCard({ tenantId: t, amountEurCents: 3, basis: 'DELIVERED', effectiveFrom: new Date(Date.now() - 1000), actorUserId: admin })
    const c = await mkConv(t, 'c'); await msg(t, c, other, 'DELIVERED'); await syncEarnings(other)
    const line = await db.operatorEarningLine.findFirstOrThrow({ where: { operatorId: other } })
    await expect(createAdjustment({ operatorId: op, amountEurCents: 5, reason: 'wrong operator line', lineId: line.id, actorUserId: admin })).rejects.toBeInstanceOf(EarningsError)
  })
})
