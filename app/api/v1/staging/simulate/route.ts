import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { normalizeLanguage } from '@/lib/languages'
import { writeAuditLog } from '@/lib/audit/log'
import { stagingSession } from '@/lib/staging/guard'
import { STAGING_CLIENTS } from '@/lib/staging/clients'

const Body = z.object({
  tenantId: z.string().min(1).max(100),
  customer: z.string().min(1).max(80),
  text: z.string().min(1).max(4000),
  language: z.string().max(10).optional(),
}).strict()

/**
 * Sends ONE message "from a customer of a simulated client platform" through the real webhook endpoint, signed with that
 * client's own integration secret - exactly the path a real client's platform uses. The secret never leaves the server.
 */
export async function POST(req: NextRequest) {
  try {
    const g = await stagingSession(req)
    if ('notFound' in g) return g.notFound
    const session = g.session
    if (await isRateLimited(`staging-sim:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const b = Body.parse(await req.json())
    const lang = b.language ? normalizeLanguage(b.language) : null
    if (b.language && !lang) return fail('Language must be a two-letter code such as en, es, fr', 400)

    const tenant = await db.tenant.findUnique({ where: { id: b.tenantId }, select: { id: true, slug: true } })
    // Only the fictional staging clients can be simulated, never any other tenant that might exist in this database.
    if (!tenant || !STAGING_CLIENTS.some((c) => c.slug === tenant.slug)) return fail('Unknown staging client', 404)
    const integration = await db.integration.findFirst({ where: { tenantId: tenant.id, adapterKey: 'dev-mock', status: 'ACTIVE' }, select: { id: true, webhookSecret: true } })
    if (!integration?.webhookSecret) return fail('This client has no active simulated platform', 409)

    const id = crypto.randomBytes(8).toString('hex')
    const event: Record<string, string> = { event_id: `sim-ev-${id}`, message_id: `sim-msg-${id}`, user_id: b.customer, text: b.text }
    if (lang) event.lang = lang
    const body = JSON.stringify({ events: [event] })
    const signature = crypto.createHmac('sha256', integration.webhookSecret).update(body).digest('hex')
    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? '3000'}/api/v1/webhooks/${integration.id}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-gco-signature': signature }, body,
    })
    if (!res.ok) return fail(`The webhook did not accept the message (${res.status})`, 502)
    await writeAuditLog({ tenantId: tenant.id, actorUserId: session.sub, action: 'staging.message_simulated', resource: 'integration', resourceId: integration.id })
    return ok({ accepted: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
