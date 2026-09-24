import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { paginated, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'CAREER_VIEW')

    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)

    const [total, applications] = await Promise.all([
      db.careerApplication.count(),
      db.careerApplication.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return paginated(applications, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}
