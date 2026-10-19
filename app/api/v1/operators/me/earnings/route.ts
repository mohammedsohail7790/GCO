import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { syncEarnings } from '@/lib/earnings/ledger'
import { getEarningsSummary, listRecentLines } from '@/lib/earnings/summary'
import { earningsRouteError } from '@/lib/earnings/http'

// An operator's own earnings only: the operator is always derived from the session, never from the request.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'EARNINGS_VIEW_OWN')
    const operator = await db.operator.findUnique({ where: { userId: session.sub }, select: { id: true } })
    if (!operator) return fail('Operator profile not found', 404)
    await syncEarnings(operator.id)
    const [summary, lines] = await Promise.all([getEarningsSummary(operator.id), listRecentLines(operator.id)])
    return ok({ ...summary, lines })
  } catch (err) {
    return earningsRouteError(err)
  }
}
