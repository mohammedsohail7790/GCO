import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { paginated, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)

    let where: any = {}
    if (session.role === 'HUNTER') {
      assertCan(session.role, 'COMMISSION_VIEW_OWN')
      where.hunterId = session.sub
    } else {
      assertCan(session.role, 'COMMISSION_VIEW_TEAM')
    }

    const [total, commissions] = await Promise.all([
      db.commission.count({ where }),
      db.commission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lead: { select: { companyName: true } } },
      }),
    ])

    return paginated(commissions, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}
