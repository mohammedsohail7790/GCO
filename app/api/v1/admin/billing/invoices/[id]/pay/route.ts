import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { markInvoicePaid } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

const Body = z.object({ reference: z.string().max(120).nullable().optional() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    const body = Body.parse(await req.json().catch(() => ({})))
    return ok(await markInvoicePaid({ id: (await params).id, reference: body.reference, actorUserId: session.sub }))
  } catch (err) {
    return billingRouteError(err)
  }
}
