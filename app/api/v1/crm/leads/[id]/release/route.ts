import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { releaseLead } from '@/lib/crm/leads'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_RELEASE')
    const { id } = await params
    const lead = await db.lead.findUnique({ where: { id } })
    if (!lead) return fail('Lead not found', 404)
    if (session.role === 'HUNTER' && lead.ownerId !== session.sub) return fail('Forbidden', 403)

    await releaseLead(id, session.sub, 'released')
    return ok({ released: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
