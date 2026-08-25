import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { ACCESS_COOKIE } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('gco_rt')?.value
    if (refreshToken) {
      await db.session.updateMany({
        where: { refreshToken, revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    const response = ok({ loggedOut: true })
    response.cookies.delete(ACCESS_COOKIE)
    // Must match the path the cookie was set with (see login/route.ts) - a
    // delete with a mismatched path creates/clears a DIFFERENT cookie in the
    // browser's jar and leaves the real one behind.
    response.cookies.delete({ name: 'gco_rt', path: '/api/v1/auth' })
    return response
  } catch (err) {
    return handleRouteError(err)
  }
}
