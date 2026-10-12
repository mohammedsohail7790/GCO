import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { disable, TwoFactorError } from '@/lib/auth/twoFactor'
import { writeAuditLog } from '@/lib/audit/log'
import { isRateLimited } from '@/lib/api/rateLimit'
import { getClientIp } from '@/lib/api/clientIp'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const Schema = z.object({ password: z.string().min(1).max(200) }).strict()

// Changing two-factor needs the CURRENT PASSWORD as well as a signed-in session, so a stolen session alone cannot switch it off or re-key it.
export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    const body = Schema.parse(await req.json())
    if (await isRateLimited(`2fa-manage:${session.sub}`, 10, 15 * 60)) return fail('Too many attempts. Try again later.', 429)
    const user = await db.user.findUnique({ where: { id: session.sub } })
    if (!user || !user.isActive) return fail('Not allowed', 403)
    if (!(await bcrypt.compare(body.password, user.passwordHash))) return fail('Password is incorrect', 400)
    const result = await disable(user.id)
    await writeAuditLog({ tenantId: user.tenantId, actorUserId: user.id, action: 'auth.2fa_disabled', resource: 'user', resourceId: user.id, ipAddress: getClientIp(req.headers) })
    return ok(result ?? { done: true })
  } catch (err) {
    if (err instanceof TwoFactorError) return fail(err.message, err.status)
    return handleRouteError(err)
  }
}
