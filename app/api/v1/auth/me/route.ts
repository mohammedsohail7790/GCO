import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.sub },
      select: { id: true, email: true, role: true, tenantId: true, displayName: true, operator: true },
    })
    return ok({ user })
  } catch (err) {
    return handleRouteError(err)
  }
}
