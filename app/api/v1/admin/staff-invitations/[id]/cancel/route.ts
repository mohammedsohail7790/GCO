import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok, handleRouteError } from '@/lib/api/response'
import { cancelStaffInvite } from '@/lib/onboarding/staffInvites'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'STAFF_INVITE')
    const { id } = await params
    return ok(await cancelStaffInvite(id, session.sub))
  } catch (err) {
    return handleRouteError(err)
  }
}
