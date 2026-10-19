import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam, operatorTeamFilter } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createShift } from '@/lib/shifts/service'
import { dateParam, shiftRouteError } from '@/lib/shifts/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const from = dateParam(url.searchParams.get('from'), new Date())
    const to = dateParam(url.searchParams.get('to'), new Date(from.getTime() + 7 * 86_400_000))
    const team = await db.operator.findMany({ where: { tenantId, ...operatorTeamFilter(session) }, select: { id: true } })
    const shifts = await db.shift.findMany({
      where: { tenantId, operatorId: { in: team.map((o) => o.id) }, status: 'SCHEDULED', startsAt: { lt: to }, endsAt: { gt: from } },
      orderBy: { startsAt: 'asc' },
      take: 500,
    })
    return ok(shifts)
  } catch (err) {
    return shiftRouteError(err)
  }
}

const Body = z
  .object({ tenantId: z.string().max(100).optional(), operatorId: z.string().max(100), startsAt: z.coerce.date(), endsAt: z.coerce.date(), note: z.string().max(300).nullable().optional() })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const body = Body.parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    await assertOperatorInTeam(session, body.operatorId)
    return ok(await createShift({ tenantId, operatorId: body.operatorId, startsAt: body.startsAt, endsAt: body.endsAt, note: body.note, actorUserId: session.sub }))
  } catch (err) {
    return shiftRouteError(err)
  }
}
