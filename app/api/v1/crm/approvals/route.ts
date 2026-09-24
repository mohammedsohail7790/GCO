import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { paginated, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'APPROVAL_DECIDE')
    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)
    const status = url.searchParams.get('status') ?? 'PENDING'

    const where = { status: status as any }
    const [total, approvals] = await Promise.all([
      db.approval.count({ where }),
      db.approval.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          lead: { select: { id: true, companyName: true, contactName: true, pipelineStage: true } },
          submitter: { select: { id: true, displayName: true } },
        },
      }),
    ])

    return paginated(approvals, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}
