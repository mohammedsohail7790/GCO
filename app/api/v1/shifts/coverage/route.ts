import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok } from '@/lib/api/response'
import { getCoverage } from '@/lib/shifts/service'
import { dateParam, shiftRouteError } from '@/lib/shifts/http'

// Hourly coverage against the client's operating hours. Tenant-wide by nature (coverage is a client-level fact).
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'SHIFT_MANAGE')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const from = dateParam(url.searchParams.get('from'), new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000))
    const to = dateParam(url.searchParams.get('to'), new Date(from.getTime() + 24 * 3_600_000))
    return ok(await getCoverage(tenantId, from, to))
  } catch (err) {
    return shiftRouteError(err)
  }
}
