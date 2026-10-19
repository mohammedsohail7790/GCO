import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { requestRouteError } from '@/lib/requests/http'

// GCO side inbox. Managers: their own client; CEO/assistant: every client (or one via ?tenantId=).
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'CLIENT_REQUEST_MANAGE')
    const url = new URL(req.url)
    const global = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    const wanted = url.searchParams.get('tenantId')
    const tenantId = global ? wanted : resolveTenantScope(session, wanted)
    const status = url.searchParams.get('status')
    const rows = await db.clientRequest.findMany({ where: { ...(tenantId ? { tenantId } : {}), ...(status && ['OPEN', 'IN_PROGRESS', 'DONE', 'DECLINED'].includes(status) ? { status: status as never } : {}) }, orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }], take: 200 })
    const tenants = await db.tenant.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.tenantId))] } }, select: { id: true, name: true } })
    return ok(rows.map((r) => ({ ...r, tenantName: tenants.find((t) => t.id === r.tenantId)?.name ?? '' })))
  } catch (err) {
    return requestRouteError(err)
  }
}
