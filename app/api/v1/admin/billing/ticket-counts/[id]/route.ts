import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { deleteExternalTicketCount } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

/** A wrong entry is deleted (audited) and re-entered; refused once an invoice covers its period. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    const { id } = await params
    await deleteExternalTicketCount({ id, actorUserId: session.sub })
    return ok({ id, deleted: true })
  } catch (err) {
    return billingRouteError(err)
  }
}
