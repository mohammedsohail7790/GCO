import { NextRequest } from 'next/server'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { stagingSession } from '@/lib/staging/guard'
import { STAGING_CLIENTS } from '@/lib/staging/clients'

export const dynamic = 'force-dynamic'

// What the simulated client platform has "received": the replies GCO operators sent for this client, newest first.
export async function GET(req: NextRequest) {
  try {
    const g = await stagingSession(req)
    if ('notFound' in g) return g.notFound
    const tenantId = new URL(req.url).searchParams.get('tenantId')
    if (!tenantId) return fail('tenantId is required', 400)
    const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } })
    if (!tenant || !STAGING_CLIENTS.some((c) => c.slug === tenant.slug)) return fail('Unknown staging client', 404)
    const rows = await db.message.findMany({
      where: { tenantId, direction: 'OUTBOUND', status: { in: ['DELIVERED', 'SENT'] } },
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { id: true, content: true, status: true, sentAt: true, conversation: { select: { externalUserId: true, language: true } } },
    })
    return ok(rows.map((m) => ({ id: m.id, customer: m.conversation.externalUserId, language: m.conversation.language, text: m.content, status: m.status, at: (m.sentAt ?? new Date()).toISOString() })))
  } catch (err) {
    return handleRouteError(err)
  }
}
