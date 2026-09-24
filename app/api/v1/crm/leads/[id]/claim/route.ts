import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, handleRouteError } from '@/lib/api/response'
import { claimLead } from '@/lib/crm/leads'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_CLAIM')
    const { id } = await params
    const lead = await claimLead(id, session.sub)
    return ok(lead)
  } catch (err) {
    return handleRouteError(err)
  }
}
