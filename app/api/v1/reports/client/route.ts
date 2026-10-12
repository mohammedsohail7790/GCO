import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { handleRouteError } from '@/lib/api/response'
import { clientReport } from '@/lib/reports/client'

const Query = z.object({ days: z.coerce.number().int().min(1).max(90).default(14), tenantId: z.string().max(100).optional() })

// Client-safe aggregates only (see lib/reports/client.ts). CLIENT is pinned to its own tenant by resolveTenantScope.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'VIEW_TENANT_ANALYTICS')
    const q = Query.parse(Object.fromEntries(new URL(req.url).searchParams))
    const tenantId = resolveTenantScope(session, q.tenantId ?? null)
    return NextResponse.json({ ok: true, data: await clientReport(tenantId, q.days) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return handleRouteError(err)
  }
}
