import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db/client'
import { signAccessToken } from '@/lib/auth/tokens'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { ACCESS_COOKIE } from '@/lib/auth/session'
import { writeAuditLog } from '@/lib/audit/log'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    const body = LoginSchema.parse(await req.json())

    // Redis-backed (not per-process in-memory) so this actually holds up
    // across multiple app instances in production - see
    // docs/production-readiness-audit.md.
    if (await isRateLimited(`login:${ip}:${body.email}`, RATE_LIMITS.LOGIN.max, RATE_LIMITS.LOGIN.windowSeconds)) {
      return fail('Too many login attempts. Try again later.', 429)
    }

    const user = await db.user.findUnique({ where: { email: body.email } })
    if (!user || !user.isActive) return fail('Invalid credentials', 401)

    const validPassword = await bcrypt.compare(body.password, user.passwordHash)
    if (!validPassword) {
      await writeAuditLog({
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: 'auth.login_failed',
        resource: 'user',
        resourceId: user.id,
        ipAddress: ip,
      })
      return fail('Invalid credentials', 401)
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      role: user.role,
      tenantId: user.tenantId,
      email: user.email,
    })

    const refreshTtlDays = parseInt(process.env.AUTH_REFRESH_TTL_DAYS ?? '30', 10)
    const refreshToken = nanoid(48)
    await db.session.create({
      data: {
        userId: user.id,
        refreshToken,
        userAgent: req.headers.get('user-agent'),
        ipAddress: ip,
        expiresAt: new Date(Date.now() + refreshTtlDays * 86400_000),
      },
    })

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await writeAuditLog({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'auth.login',
      resource: 'user',
      resourceId: user.id,
      ipAddress: ip,
    })

    const response = ok({
      user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId, displayName: user.displayName },
    })

    const ttlMinutes = parseInt(process.env.AUTH_TOKEN_TTL_MINUTES ?? '60', 10)
    response.cookies.set(ACCESS_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: ttlMinutes * 60,
    })
    response.cookies.set('gco_rt', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      // Scoped to /api/v1/auth (not just /refresh) - logout must also be able
      // to read this cookie to revoke the session server-side. A narrower
      // path here previously meant logout silently never saw the refresh
      // cookie, so refresh kept working after "logout" (see tests/e2e/07-session-security.spec.ts).
      path: '/api/v1/auth',
      maxAge: refreshTtlDays * 86400,
    })

    return response
  } catch (err) {
    return handleRouteError(err)
  }
}
