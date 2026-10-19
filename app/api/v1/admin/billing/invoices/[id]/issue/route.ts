import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { issueInvoice } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    return ok(await issueInvoice({ id: (await params).id, actorUserId: session.sub }))
  } catch (err) {
    return billingRouteError(err)
  }
}
