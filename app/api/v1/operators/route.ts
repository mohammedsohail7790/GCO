import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

/** Manager/CEO_ADMIN operator roster with live workload, for QC and monitoring. */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'VIEW_OPERATOR_DETAIL')
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))

    const operators = await db.operator.findMany({
      where: { tenantId },
      include: {
        user: { select: { displayName: true, email: true, isActive: true } },
        assignments: { where: { status: 'ACTIVE' } },
      },
      orderBy: { operatorNumber: 'asc' },
    })

    return ok(
      operators.map((op) => ({
        id: op.id,
        operatorNumber: op.operatorNumber,
        status: op.status,
        capacity: op.capacity,
        activeAssignments: op.assignments.length,
        user: op.user,
      })),
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
