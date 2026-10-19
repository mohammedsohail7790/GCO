import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { shiftRouteError } from '@/lib/shifts/http'

// An operator's own upcoming shifts and absences (next 14 days, plus the last day).
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_VIEW_OWN')
    const op = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!op) return fail('Operator profile not found', 404)
    const from = new Date(Date.now() - 86_400_000)
    const to = new Date(Date.now() + 14 * 86_400_000)
    const [shifts, absences] = await Promise.all([
      db.shift.findMany({ where: { operatorId: op.id, status: 'SCHEDULED', endsAt: { gt: from }, startsAt: { lt: to } }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, endsAt: true, note: true } }),
      db.absence.findMany({ where: { operatorId: op.id, endsAt: { gt: from }, startsAt: { lt: to } }, orderBy: { startsAt: 'asc' }, select: { id: true, kind: true, startsAt: true, endsAt: true } }),
    ])
    return ok({ shifts, absences })
  } catch (err) {
    return shiftRouteError(err)
  }
}
