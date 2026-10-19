import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import type { OperatingHours } from '@/lib/tenant/settings'
import { coverageSlots, overlapHours } from './coverage'

export class ShiftError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

const MIN_MS = 15 * 60_000
const MAX_MS = 16 * 3_600_000

export async function createShift(i: { tenantId: string; operatorId: string; startsAt: Date; endsAt: Date; note?: string | null; actorUserId: string }) {
  const len = i.endsAt.getTime() - i.startsAt.getTime()
  if (!(len >= MIN_MS)) throw new ShiftError('A shift must end at least 15 minutes after it starts')
  if (len > MAX_MS) throw new ShiftError('A shift cannot be longer than 16 hours')
  const op = await db.operator.findUnique({ where: { id: i.operatorId }, select: { tenantId: true } })
  if (!op || op.tenantId !== i.tenantId) throw new ShiftError('Operator not found', 404)
  const clash = await db.shift.findFirst({ where: { operatorId: i.operatorId, status: 'SCHEDULED', startsAt: { lt: i.endsAt }, endsAt: { gt: i.startsAt } } })
  if (clash) throw new ShiftError('The operator already has a shift in that period', 409)
  const absent = await db.absence.findFirst({ where: { operatorId: i.operatorId, startsAt: { lt: i.endsAt }, endsAt: { gt: i.startsAt } } })
  if (absent) throw new ShiftError('The operator is marked absent in that period', 409)
  const shift = await db.shift.create({ data: { tenantId: i.tenantId, operatorId: i.operatorId, startsAt: i.startsAt, endsAt: i.endsAt, note: i.note?.slice(0, 300) ?? null, createdByUserId: i.actorUserId } })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'shift.created', resource: 'shift', resourceId: shift.id, metadata: { operatorId: i.operatorId } })
  return shift
}

export async function cancelShift(i: { shiftId: string; tenantId: string; actorUserId: string }) {
  const r = await db.shift.updateMany({ where: { id: i.shiftId, tenantId: i.tenantId, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } })
  if (r.count === 0) throw new ShiftError('Shift not found', 404)
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'shift.cancelled', resource: 'shift', resourceId: i.shiftId })
}

export async function createAbsence(i: { tenantId: string; operatorId: string; kind: 'SICK' | 'LEAVE' | 'NO_SHOW' | 'OTHER'; startsAt: Date; endsAt: Date; note?: string | null; actorUserId: string }) {
  if (!(i.endsAt.getTime() > i.startsAt.getTime())) throw new ShiftError('An absence must end after it starts')
  if (i.endsAt.getTime() - i.startsAt.getTime() > 60 * 86_400_000) throw new ShiftError('An absence cannot be longer than 60 days')
  const op = await db.operator.findUnique({ where: { id: i.operatorId }, select: { tenantId: true } })
  if (!op || op.tenantId !== i.tenantId) throw new ShiftError('Operator not found', 404)
  const absence = await db.absence.create({ data: { tenantId: i.tenantId, operatorId: i.operatorId, kind: i.kind, startsAt: i.startsAt, endsAt: i.endsAt, note: i.note?.slice(0, 300) ?? null, createdByUserId: i.actorUserId } })
  const affected = await db.shift.count({ where: { operatorId: i.operatorId, status: 'SCHEDULED', startsAt: { lt: i.endsAt }, endsAt: { gt: i.startsAt } } })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'absence.recorded', resource: 'absence', resourceId: absence.id, metadata: { operatorId: i.operatorId, kind: i.kind, affectedShifts: affected } })
  return { absence, affectedShifts: affected }
}

export async function getCoverage(tenantId: string, from: Date, to: Date) {
  if (to.getTime() <= from.getTime() || to.getTime() - from.getTime() > 14 * 86_400_000) throw new ShiftError('Choose a window of up to 14 days')
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { timezone: true, operatingHours: true } })
  const [shifts, absences] = await Promise.all([
    db.shift.findMany({ where: { tenantId, status: 'SCHEDULED', startsAt: { lt: to }, endsAt: { gt: from } }, select: { operatorId: true, startsAt: true, endsAt: true } }),
    db.absence.findMany({ where: { tenantId, startsAt: { lt: to }, endsAt: { gt: from } }, select: { operatorId: true, startsAt: true, endsAt: true } }),
  ])
  const slots = coverageSlots({ from, to, timezone: tenant.timezone, hours: tenant.operatingHours as OperatingHours | null, shifts, absences })
  return { planned: shifts.length > 0, slots, gaps: slots.filter((s) => s.gap).length }
}

/** Scheduled hours (net of absences) and absence count for an operator-week; null when there is nothing planned or recorded. */
export async function weeklyAttendance(operatorId: string, from: Date, to: Date) {
  const [shifts, absences] = await Promise.all([
    db.shift.findMany({ where: { operatorId, status: 'SCHEDULED', startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
    db.absence.findMany({ where: { operatorId, startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } }),
  ])
  if (shifts.length === 0 && absences.length === 0) return null
  let hours = 0
  for (const s of shifts) {
    let h = overlapHours(s.startsAt, s.endsAt, from, to)
    for (const a of absences) h -= overlapHours(new Date(Math.max(a.startsAt.getTime(), s.startsAt.getTime())), new Date(Math.min(a.endsAt.getTime(), s.endsAt.getTime())), from, to)
    hours += Math.max(0, h)
  }
  return { scheduledHours: Math.round(hours * 10) / 10, absences: absences.length }
}

// ---- handovers -------------------------------------------------------------------------------------------------

export async function createHandover(i: { operatorId: string; toOperatorId?: string | null; body: string; conversationIds: string[]; actorUserId: string }) {
  const body = i.body.trim()
  if (body.length < 3 || body.length > 2000) throw new ShiftError('Write a handover note of 3-2000 characters')
  const from = await db.operator.findUnique({ where: { id: i.operatorId }, select: { tenantId: true } })
  if (!from) throw new ShiftError('Operator not found', 404)
  if (i.toOperatorId) {
    const to = await db.operator.findUnique({ where: { id: i.toOperatorId }, select: { tenantId: true } })
    if (!to || to.tenantId !== from.tenantId) throw new ShiftError('Receiving operator not found', 404)
  }
  // Only conversations the operator currently holds can be attached - a note can never point at someone else's conversation.
  const held = await db.assignment.findMany({ where: { operatorId: i.operatorId, status: 'ACTIVE', conversationId: { in: i.conversationIds.slice(0, 20) } }, select: { conversationId: true } })
  if (held.length !== new Set(i.conversationIds.slice(0, 20)).size) throw new ShiftError('You can only hand over conversations you currently hold', 403)
  const h = await db.shiftHandover.create({ data: { tenantId: from.tenantId, fromOperatorId: i.operatorId, toOperatorId: i.toOperatorId ?? null, body, conversationIds: held.map((x) => x.conversationId) } })
  await writeAuditLog({ tenantId: from.tenantId, actorUserId: i.actorUserId, action: 'handover.created', resource: 'shift_handover', resourceId: h.id, metadata: { to: i.toOperatorId ?? null, conversations: h.conversationIds.length } })
  return h
}

export async function acknowledgeHandover(i: { handoverId: string; tenantId: string; operatorId: string | null; actorUserId: string }) {
  const h = await db.shiftHandover.findFirst({ where: { id: i.handoverId, tenantId: i.tenantId } })
  if (!h) throw new ShiftError('Handover not found', 404)
  if (i.operatorId && h.toOperatorId && h.toOperatorId !== i.operatorId) throw new ShiftError('Handover not found', 404)
  if (i.operatorId && h.fromOperatorId === i.operatorId) throw new ShiftError('You cannot acknowledge your own handover', 409)
  const r = await db.shiftHandover.updateMany({ where: { id: h.id, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), acknowledgedByUserId: i.actorUserId } })
  if (r.count === 0) throw new ShiftError('Already acknowledged', 409)
  return db.shiftHandover.findUniqueOrThrow({ where: { id: h.id } })
}
