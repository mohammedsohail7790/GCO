import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { paginated, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'VIEW_AUDIT_LOGS')
    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '50', 10), 200)
    const tenantId = url.searchParams.get('tenantId')

    const where = tenantId ? { tenantId } : {}
    const [total, logs] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])

    return paginated(logs, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}
