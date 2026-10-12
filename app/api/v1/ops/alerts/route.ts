import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { handleRouteError } from '@/lib/api/response'
import { computeAlerts } from '@/lib/ops/alerts'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'OPS_ALERTS_VIEW')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return NextResponse.json({ ok: true, data: await computeAlerts(tenantId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return handleRouteError(err)
  }
}
