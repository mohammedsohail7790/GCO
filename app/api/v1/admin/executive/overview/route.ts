import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { fail, ok, handleRouteError } from '@/lib/api/response'
import { computeExecutive } from '@/lib/executive/overview'

// Company-wide revenue, cost and margin: CEO only (VIEW_REVENUE). Default period: month to date.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'VIEW_REVENUE')
    const url = new URL(req.url)
    const now = new Date()
    const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date(now.getTime() + 1)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) return fail('Choose a valid period of up to a year', 400)
    return ok(await computeExecutive(from, to, now))
  } catch (err) {
    return handleRouteError(err)
  }
}
