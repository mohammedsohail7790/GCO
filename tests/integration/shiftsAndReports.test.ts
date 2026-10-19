import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db/client'
import { createShift, cancelShift, createAbsence, getCoverage, weeklyAttendance, createHandover, acknowledgeHandover, ShiftError } from '@/lib/shifts/service'
import { ensureWeeklyReport, presentReport, weekStartOf } from '@/lib/reports/weekly'
import { computeAlerts } from '@/lib/ops/alerts'
import { createRateCard } from '@/lib/earnings/ledger'

describe('shifts, handovers and weekly reports (real database)', () => {
  const base = `sr-${Date.now()}`
  const tenantIds: string[] = []
  const userIds: string[] = []
  const H = 3_600_000
  const mkTenant = async (tag: string, extra: object = {}) => { const t = await db.tenant.create({ data: { name: `[TEST] ${base}-${tag}`, slug: `${base}-${tag}`, ...extra } }); tenantIds.push(t.id); return t.id }
  const mkUser = async (tenantId: string, tag: string, role: 'OPERATOR' | 'MANAGER' = 'OPERATOR') => { const u = await db.user.create({ data: { email: `${base}-${tenantId.slice(-6)}-${tag}@test.gco`, passwordHash: 'x', role, tenantId, displayName: tag } }); userIds.push(u.id); return u }
  const mkOp = async (tenantId: string, tag: string, status: 'AVAILABLE' | 'OFFLINE' = 'AVAILABLE') => { const u = await mkUser(tenantId, tag); return (await db.operator.create({ data: { userId: u.id, tenantId, status } })).id }

  afterAll(async () => {
    const ops = (await db.operator.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })).map((o) => o.id)
    await db.operatorWeeklyReport.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operatorEarningLine.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorEarningAdjustment.deleteMany({ where: { operatorId: { in: ops } } })
    await db.operatorRateCard.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.shiftHandover.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.shift.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.absence.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.qaReview.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.assignmentHistoryEntry.deleteMany({ where: { assignment: { tenantId: { in: tenantIds } } } })
    await db.conversation.updateMany({ where: { tenantId: { in: tenantIds } }, data: { currentAssignmentId: null } })
    await db.assignment.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.message.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.operator.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  })

  it('validates shifts: length, overlap, absence, cross-tenant operator', async () => {
    const t = await mkTenant('v'); const other = await mkTenant('v2'); const op = await mkOp(t, 'op'); const foreign = await mkOp(other, 'f')
    const start = new Date(Date.now() + 24 * H); const end = new Date(start.getTime() + 8 * H)
    const args = { tenantId: t, operatorId: op, actorUserId: 'u' }
    await expect(createShift({ ...args, startsAt: start, endsAt: new Date(start.getTime() + 60_000) })).rejects.toBeInstanceOf(ShiftError)
    await expect(createShift({ ...args, startsAt: start, endsAt: new Date(start.getTime() + 20 * H) })).rejects.toBeInstanceOf(ShiftError)
    const s = await createShift({ ...args, startsAt: start, endsAt: end })
    await expect(createShift({ ...args, startsAt: new Date(start.getTime() + H), endsAt: new Date(end.getTime() + H) })).rejects.toMatchObject({ status: 409 })
    await expect(createShift({ ...args, operatorId: foreign, startsAt: start, endsAt: end })).rejects.toMatchObject({ status: 404 })
    await cancelShift({ shiftId: s.id, tenantId: t, actorUserId: 'u' })
    await expect(cancelShift({ shiftId: s.id, tenantId: t, actorUserId: 'u' })).rejects.toMatchObject({ status: 404 })
    await expect(cancelShift({ shiftId: s.id, tenantId: other, actorUserId: 'u' })).rejects.toMatchObject({ status: 404 })
    await createShift({ ...args, startsAt: start, endsAt: end }) // free again after cancel
    const abs = await createAbsence({ tenantId: t, operatorId: op, kind: 'SICK', startsAt: start, endsAt: end, actorUserId: 'u' })
    expect(abs.affectedShifts).toBe(1)
    await expect(createShift({ ...args, startsAt: new Date(start.getTime() + 9 * H), endsAt: new Date(start.getTime() + 10 * H) })).resolves.toBeTruthy() // outside the absence
    await expect(createShift({ ...args, startsAt: new Date(start.getTime() + H), endsAt: new Date(start.getTime() + 2 * H) })).rejects.toMatchObject({ status: 409 })
  })

  it('coverage and attendance follow shifts and absences', async () => {
    const t = await mkTenant('cov'); const op = await mkOp(t, 'op')
    const from = new Date(Math.ceil((Date.now() + 48 * H) / H) * H)
    expect((await getCoverage(t, from, new Date(from.getTime() + 4 * H))).planned).toBe(false) // nothing planned: no gap noise
    await createShift({ tenantId: t, operatorId: op, startsAt: from, endsAt: new Date(from.getTime() + 2 * H), actorUserId: 'u' })
    const cov = await getCoverage(t, from, new Date(from.getTime() + 4 * H))
    expect(cov.planned).toBe(true); expect(cov.gaps).toBe(2) // 24/7 client: hours 3 and 4 are open and empty
    await createAbsence({ tenantId: t, operatorId: op, kind: 'LEAVE', startsAt: from, endsAt: new Date(from.getTime() + H), actorUserId: 'u' })
    expect(await weeklyAttendance(op, from, new Date(from.getTime() + 24 * H))).toEqual({ scheduledHours: 1, absences: 1 })
    expect(await weeklyAttendance(op, new Date(from.getTime() + 30 * 24 * H), new Date(from.getTime() + 31 * 24 * H))).toBeNull()
    await expect(getCoverage(t, from, new Date(from.getTime() + 20 * 24 * H))).rejects.toBeInstanceOf(ShiftError)
  })

  it('alerts: coverage gap and "on shift but offline" only when the client plans shifts', async () => {
    const t = await mkTenant('al'); const op = await mkOp(t, 'op', 'OFFLINE')
    expect((await computeAlerts(t)).map((a) => a.id)).not.toContain('coverage-gap')
    const now = new Date()
    await createShift({ tenantId: t, operatorId: op, startsAt: new Date(now.getTime() - 3 * H), endsAt: new Date(now.getTime() + 1 * H), actorUserId: 'u' })
    const ids = (await computeAlerts(t)).map((a) => a.id)
    expect(ids).toContain('shift-not-online'); expect(ids).toContain('coverage-gap') // 24/7 client, shift ends in an hour, 7 empty hours follow
    await db.operator.update({ where: { id: op }, data: { status: 'AVAILABLE' } })
    expect((await computeAlerts(t)).map((a) => a.id)).not.toContain('shift-not-online')
  })

  it('handovers: only held conversations can be attached; team or named recipient; acknowledged once', async () => {
    const t = await mkTenant('ho'); const a = await mkOp(t, 'a'); const b = await mkOp(t, 'b'); const c = await mkOp(t, 'c')
    const conv = await db.conversation.create({ data: { tenantId: t, externalUserId: `${base}-ho`, state: 'ACTIVE' } })
    const other = await db.conversation.create({ data: { tenantId: t, externalUserId: `${base}-ho2`, state: 'ACTIVE' } })
    await db.assignment.create({ data: { tenantId: t, conversationId: conv.id, operatorId: a, slaSeconds: 120, respondsBy: new Date(Date.now() + 120_000) } })
    await expect(createHandover({ operatorId: a, body: 'x', conversationIds: [], actorUserId: 'u' })).rejects.toBeInstanceOf(ShiftError)
    await expect(createHandover({ operatorId: a, body: 'customer waiting for refund', conversationIds: [other.id], actorUserId: 'u' })).rejects.toMatchObject({ status: 403 })
    const h = await createHandover({ operatorId: a, toOperatorId: b, body: 'customer waiting for refund', conversationIds: [conv.id], actorUserId: 'u' })
    expect(h.conversationIds).toEqual([conv.id])
    await expect(acknowledgeHandover({ handoverId: h.id, tenantId: t, operatorId: c, actorUserId: 'c' })).rejects.toMatchObject({ status: 404 }) // addressed to b
    const pool = await createHandover({ operatorId: a, body: 'anyone taking over: queue is calm', conversationIds: [], actorUserId: 'u' })
    await expect(acknowledgeHandover({ handoverId: pool.id, tenantId: t, operatorId: a, actorUserId: 'a' })).rejects.toMatchObject({ status: 409 }) // not your own
    await expect(acknowledgeHandover({ handoverId: h.id, tenantId: t, operatorId: a, actorUserId: 'a' })).rejects.toMatchObject({ status: 404 }) // sender is not the addressee
    await acknowledgeHandover({ handoverId: h.id, tenantId: t, operatorId: b, actorUserId: 'b' })
    await expect(acknowledgeHandover({ handoverId: h.id, tenantId: t, operatorId: b, actorUserId: 'b' })).rejects.toMatchObject({ status: 409 })
  })

  it('weekly report: real metrics, earnings only when authorized, frozen after review, comparison with last week', async () => {
    const t = await mkTenant('wr'); const op = await mkOp(t, 'op'); const mgr = await mkUser(t, 'mgr', 'MANAGER')
    const conv = await db.conversation.create({ data: { tenantId: t, externalUserId: `${base}-wr`, state: 'ACTIVE' } })
    const week = weekStartOf(new Date()); const prev = new Date(week.getTime() - 7 * 24 * H)
    await createRateCard({ tenantId: t, amountEurCents: 10, basis: 'DELIVERED', effectiveFrom: new Date(prev.getTime() - 24 * H), actorUserId: mgr.id })
    const mk = (status: 'DELIVERED' | 'FAILED', when: Date, n: string) => db.message.create({ data: { tenantId: t, conversationId: conv.id, direction: 'OUTBOUND', status, content: 'x', operatorId: op, externalMessageId: `${base}-${n}`, createdAt: when } })
    const inWeek = new Date(week.getTime() + H)
    const m1 = await mk('DELIVERED', inWeek, 'm1'); await mk('DELIVERED', inWeek, 'm2'); await mk('FAILED', inWeek, 'm3'); await mk('DELIVERED', new Date(prev.getTime() + H), 'p1')
    await db.qaReview.create({ data: { tenantId: t, conversationId: conv.id, messageId: m1.id, operatorId: op, reviewerUserId: mgr.id, accuracy: 5, tone: 4, resolution: 5, outcome: 'PASS', createdAt: inWeek } })
    await db.assignment.create({ data: { tenantId: t, conversationId: conv.id, operatorId: op, status: 'COMPLETED', slaSeconds: 120, assignedAt: inWeek, respondedAt: new Date(inWeek.getTime() + 40_000), respondsBy: new Date(inWeek.getTime() + 120_000) } })
    await createShift({ tenantId: t, operatorId: op, startsAt: new Date(week.getTime() + 2 * H), endsAt: new Date(week.getTime() + 10 * H), actorUserId: mgr.id }).catch(() => null)

    const report = await ensureWeeklyReport(op, week)
    const full = await presentReport(report, { showEarnings: true, feedbackVisible: true })
    expect(full.metrics).toMatchObject({ messages: { written: 3, delivered: 2, failed: 1, approved: 1, rejected: 0, unreviewed: 1 }, quality: { reviews: 1, avgAccuracy: 5, passRate: 100 }, response: { conversationsHandled: 1, avgResponseSeconds: 40, slaMissed: 0, slaMetPct: 100 }, earningsEurCents: 20 })
    expect((full.metrics as { attendance: unknown }).attendance).toEqual({ scheduledHours: 8, absences: 0 })
    expect(full.comparison).toMatchObject({ written: 2, delivered: 1 }) // 3 written vs 1 the week before
    const hidden = await presentReport(report, { showEarnings: false, feedbackVisible: true })
    expect('earningsEurCents' in hidden.metrics).toBe(false)
    expect(hidden.comparison && 'earningsEurCents' in hidden.comparison).toBe(false)

    // review freezes it: later activity does not change the stored report
    await db.operatorWeeklyReport.update({ where: { id: report.id }, data: { status: 'REVIEWED', managerFeedback: 'Good week', reviewedByUserId: mgr.id, reviewedAt: new Date() } })
    await mk('DELIVERED', inWeek, 'late')
    const again = await ensureWeeklyReport(op, week)
    expect((again.metrics as { messages: { written: number } }).messages.written).toBe(3)
    expect(again.managerFeedback).toBe('Good week')
  })
})
