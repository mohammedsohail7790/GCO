import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { createPayout, syncEarnings } from '@/lib/earnings/ledger'
import { earningsRouteError } from '@/lib/earnings/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'PAYOUT_MANAGE')
    const status = new URL(req.url).searchParams.get('status')
    return ok(await db.operatorPayout.findMany({ where: status === 'PENDING' || status === 'PAID' ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (err) {
    return earningsRouteError(err)
  }
}

const Body = z.object({ operatorId: z.string().max(100), periodEnd: z.coerce.date() }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PAYOUT_MANAGE')
    const body = Body.parse(await req.json())
    if (body.periodEnd.getTime() > Date.now() + 60_000) return fail('periodEnd cannot be in the future', 400)
    await syncEarnings(body.operatorId) // settle against current state, not a stale ledger
    return ok(await createPayout({ ...body, actorUserId: session.sub }))
  } catch (err) {
    return earningsRouteError(err)
  }
}
