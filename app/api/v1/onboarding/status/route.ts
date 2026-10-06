import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { clientView } from '@/lib/onboarding/service'

// A CLIENT's own onboarding progress. The tenant comes from the session, never from the request.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'ONBOARDING_VIEW_OWN')
    if (!session.tenantId) return fail('Forbidden', 403)
    return ok(await clientView(session.tenantId))
  } catch (err) {
    return handleRouteError(err)
  }
}
