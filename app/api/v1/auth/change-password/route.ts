import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { hashPassword, validateStaffPassword } from '@/lib/auth/password'
import { writeAuditLog } from '@/lib/audit/log'
import { isRateLimited } from '@/lib/api/rateLimit'
import { getClientIp } from '@/lib/api/clientIp'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const Schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).strict()

/**
 * A signed-in user changes their own password. Requires the current password (so a stolen session alone cannot take over
 * the account), enforces the staff password policy, and signs the account out everywhere else. The audit entry never
 * contains either password.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    const body = Schema.parse(await req.json())
    if (await isRateLimited(`change-password:${session.sub}`, 5, 15 * 60)) return fail('Too many attempts. Try again later.', 429)

    const user = await db.user.findUnique({ where: { id: session.sub } })
    if (!user || !user.isActive) return fail('Not allowed', 403)
    if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) return fail('Current password is incorrect', 400)
    if (body.newPassword === body.currentPassword) return fail('Choose a password different from the current one', 400)
    const problem = validateStaffPassword(body.newPassword, user.email)
    if (problem) return fail(problem, 400)

    const passwordHash = await hashPassword(body.newPassword)
    const keep = req.cookies.get('gco_rt')?.value
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash } }),
      db.session.updateMany({ where: { userId: user.id, revokedAt: null, ...(keep ? { refreshToken: { not: keep } } : {}) }, data: { revokedAt: new Date() } }),
    ])
    await writeAuditLog({ tenantId: user.tenantId, actorUserId: user.id, action: 'auth.password_changed', resource: 'user', resourceId: user.id, ipAddress: getClientIp(req.headers) })
    return ok({ changed: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
