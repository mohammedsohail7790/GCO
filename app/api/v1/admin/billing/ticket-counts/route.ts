import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { fail, ok } from '@/lib/api/response'
import { recordExternalTicketCount } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

// Ticket counts from a client's OWN support tool (Option A: GCO operators working inside Zendesk, Intercom, ...), taken from that
// tool's report and recorded for billing. CEO-only like the rest of billing.
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'BILLING_MANAGE')
    const tenantId = new URL(req.url).searchParams.get('tenantId')
    if (!tenantId) return fail('tenantId is required', 400)
    return ok(await db.externalTicketCount.findMany({ where: { tenantId }, orderBy: { periodStart: 'desc' }, take: 100 }))
  } catch (err) {
    return billingRouteError(err)
  }
}

const Body = z
  .object({ tenantId: z.string().max(100), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), count: z.number().int().min(0).max(1_000_000), source: z.string().trim().min(2).max(100), note: z.string().max(300).nullable().optional() })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    return ok(await recordExternalTicketCount({ ...Body.parse(await req.json()), actorUserId: session.sub }))
  } catch (err) {
    return billingRouteError(err)
  }
}
