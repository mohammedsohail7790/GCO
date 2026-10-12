import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok, handleRouteError } from '@/lib/api/response'
import { reissueStaffInvite } from '@/lib/onboarding/staffInvites'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'STAFF_INVITE')
    const { id } = await params
    const r = await reissueStaffInvite(id, session.sub)
    return ok({ setupUrl: r.setupUrl, expiresAt: r.expiresAt.toISOString() })
  } catch (err) {
    return handleRouteError(err)
  }
}
