import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createDraftInvoice } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'BILLING_MANAGE')
    const url = new URL(req.url)
    const tenantId = url.searchParams.get('tenantId')
    const status = url.searchParams.get('status')
    return ok(await db.invoice.findMany({ where: { ...(tenantId ? { tenantId } : {}), ...(status && ['DRAFT', 'ISSUED', 'PAID', 'VOID'].includes(status) ? { status: status as never } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 }))
  } catch (err) {
    return billingRouteError(err)
  }
}

const Body = z.object({ tenantId: z.string().max(100), periodStart: z.coerce.date(), periodEnd: z.coerce.date() }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    return ok(await createDraftInvoice({ ...Body.parse(await req.json()), actorUserId: session.sub }))
  } catch (err) {
    return billingRouteError(err)
  }
}
