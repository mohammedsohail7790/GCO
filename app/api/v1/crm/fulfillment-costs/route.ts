import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { created, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

// Manual entry for MVP, same reasoning as /crm/revenue. Net margin (see
// /crm/dashboard/ceo) reports "incomplete" for any period with no matching
// FulfillmentCost row here - it never assumes zero cost.
const Schema = z.object({
  tenantId: z.string(),
  amountEurCents: z.number().int().min(0),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'REVENUE_RECORD') // same authority as recording revenue
    const body = Schema.parse(await req.json())

    const record = await db.fulfillmentCost.create({
      data: {
        tenantId: body.tenantId,
        amountEurCents: body.amountEurCents,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
      },
    })
    await writeAuditLog({
      tenantId: body.tenantId,
      actorUserId: session.sub,
      action: 'fulfillment_cost.recorded',
      resource: 'fulfillment_cost',
      resourceId: record.id,
      metadata: { amountEurCents: body.amountEurCents },
    })

    return created(record)
  } catch (err) {
    return handleRouteError(err)
  }
}
