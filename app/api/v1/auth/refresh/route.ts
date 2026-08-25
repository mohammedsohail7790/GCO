import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { signAccessToken } from '@/lib/auth/tokens'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { ACCESS_COOKIE } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get('gco_rt')?.value
    if (!refreshToken) return fail('No refresh token', 401)

    const session = await db.session.findUnique({ where: { refreshToken }, include: { user: true } })
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) {
      return fail('Invalid or expired session', 401)
    }

    const accessToken = await signAccessToken({
      sub: session.user.id,
      role: session.user.role,
      tenantId: session.user.tenantId,
      email: session.user.email,
    })

    const response = ok({ refreshed: true })
    const ttlMinutes = parseInt(process.env.AUTH_TOKEN_TTL_MINUTES ?? '60', 10)
    response.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: ttlMinutes * 60,
    })
    return response
  } catch (err) {
    return handleRouteError(err)
  }
}
