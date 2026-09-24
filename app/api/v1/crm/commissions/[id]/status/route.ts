import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

const Schema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']) })

// CEO-only, manual payout control for MVP - see docs/crm.md "Commissions & Payouts".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'PAYOUT_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())

    const existing = await db.commission.findUnique({ where: { id } })
    if (!existing) return fail('Commission not found', 404)

    const commission = await db.commission.update({ where: { id }, data: { status: body.status } })
    await writeAuditLog({
      actorUserId: session.sub,
      action: 'commission.status_changed',
      resource: 'commission',
      resourceId: id,
      metadata: { from: existing.status, to: body.status },
    })

    return ok(commission)
  } catch (err) {
    return handleRouteError(err)
  }
}
