import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertOperatorInTeam, operatorTeamFilter } from '@/lib/auth/teamScope'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createAbsence } from '@/lib/shifts/service'
import { dateParam, shiftRouteError } from '@/lib/shifts/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const from = dateParam(url.searchParams.get('from'), new Date(Date.now() - 7 * 86_400_000))
    const to = dateParam(url.searchParams.get('to'), new Date(Date.now() + 30 * 86_400_000))
    const team = await db.operator.findMany({ where: { tenantId, ...operatorTeamFilter(session) }, select: { id: true } })
    return ok(await db.absence.findMany({ where: { tenantId, operatorId: { in: team.map((o) => o.id) }, startsAt: { lt: to }, endsAt: { gt: from } }, orderBy: { startsAt: 'asc' }, take: 500 }))
  } catch (err) {
    return shiftRouteError(err)
  }
}

const Body = z
  .object({ tenantId: z.string().max(100).optional(), operatorId: z.string().max(100), kind: z.enum(['SICK', 'LEAVE', 'NO_SHOW', 'OTHER']), startsAt: z.coerce.date(), endsAt: z.coerce.date(), note: z.string().max(300).nullable().optional() })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const body = Body.parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    await assertOperatorInTeam(session, body.operatorId)
    return ok(await createAbsence({ tenantId, operatorId: body.operatorId, kind: body.kind, startsAt: body.startsAt, endsAt: body.endsAt, note: body.note, actorUserId: session.sub }))
  } catch (err) {
    return shiftRouteError(err)
  }
}
