import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { updateLeadDiscovery, UpdateDiscoverySchema } from '@/lib/crm/discovery'
import { LeadConflictError } from '@/lib/crm/leads'

/**
 * Discovery answers, qualification and next action for a lead. The owning Hunter may update their own lead; a Manager or the
 * CEO may update any lead. Clients, Operators and other Hunters are refused. Credentials are refused (400).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    if (session.role === 'HUNTER') assertCan(session.role, 'LEAD_VIEW_OWN')
    else assertCan(session.role, 'LEAD_VIEW_TEAM')
    const { id } = await params
    const lead = await db.lead.findUnique({ where: { id }, select: { id: true, ownerId: true } })
    if (!lead) return fail('Lead not found', 404)
    if (session.role === 'HUNTER' && lead.ownerId !== session.sub) return fail('Forbidden', 403)
    if (await isRateLimited(`crm-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)

    const body = UpdateDiscoverySchema.parse(await req.json())
    try {
      const updated = await updateLeadDiscovery(id, session.sub, body)
      return ok({ qualification: updated.qualification, discovery: updated.discovery ?? {}, nextAction: updated.nextAction, nextActionAt: updated.nextActionAt })
    } catch (err) {
      if (err instanceof LeadConflictError) return fail(err.message, err.status)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
