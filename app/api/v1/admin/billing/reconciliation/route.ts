import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { fail, ok } from '@/lib/api/response'
import { reconcile } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'BILLING_MANAGE')
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    const from = new Date(url.searchParams.get('from') ?? '')
    const to = new Date(url.searchParams.get('to') ?? '')
    if (!tenantId || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) return fail('tenantId, from and to (up to 3 months) are required', 400)
    return ok(await reconcile(tenantId, from, to))
  } catch (err) {
    return billingRouteError(err)
  }
}
