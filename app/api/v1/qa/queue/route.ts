import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok, handleRouteError } from '@/lib/api/response'
import { qaQueue } from '@/lib/qa/reviews'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'QA_REVIEW')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return ok(await qaQueue(tenantId))
  } catch (err) {
    return handleRouteError(err)
  }
}
