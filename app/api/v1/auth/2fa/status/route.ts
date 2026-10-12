import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { twoFactorStatus } from '@/lib/auth/twoFactor'
import { ok, handleRouteError } from '@/lib/api/response'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    return ok(await twoFactorStatus(session.sub))
  } catch (err) {
    return handleRouteError(err)
  }
}
