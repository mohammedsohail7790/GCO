import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { created, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

// Manual revenue entry for MVP - no automated billing system exists yet to
// pull from (see docs/crm.md "Revenue & Net Margin"). CEO/Manager records what
// a client actually paid/is contracted for; this is the revenue basis MRR and
// net margin are computed from downstream.
const Schema = z.object({
  tenantId: z.string(),
  leadId: z.string().optional(),
  amountEurCents: z.number().int().min(0),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'REVENUE_RECORD')
    const body = Schema.parse(await req.json())

    const record = await db.revenueRecord.create({
      data: {
        tenantId: body.tenantId,
        leadId: body.leadId,
        amountEurCents: body.amountEurCents,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        source: body.leadId ? 'DEAL_CLOSED' : 'MANUAL',
      },
    })
    await writeAuditLog({
      tenantId: body.tenantId,
      actorUserId: session.sub,
      action: 'revenue.recorded',
      resource: 'revenue_record',
      resourceId: record.id,
      metadata: { amountEurCents: body.amountEurCents },
    })

    return created(record)
  } catch (err) {
    return handleRouteError(err)
  }
}
