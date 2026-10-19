import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { voidInvoice } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

const Body = z.object({ reason: z.string().min(5).max(300) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    return ok(await voidInvoice({ id: (await params).id, reason: Body.parse(await req.json()).reason, actorUserId: session.sub }))
  } catch (err) {
    return billingRouteError(err)
  }
}
