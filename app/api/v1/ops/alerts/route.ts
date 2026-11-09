import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { fail, handleRouteError } from '@/lib/api/response'
import { computeAlerts } from '@/lib/ops/alerts'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'OPS_ALERTS_VIEW')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    // Global roles (CEO, assistant, CTO) belong to no client: alerts are per client, so one must be chosen.
    if (!tenantId) return fail('Choose a client first', 400)
    return NextResponse.json({ ok: true, data: await computeAlerts(tenantId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return handleRouteError(err)
  }
}
