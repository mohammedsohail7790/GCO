import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { fail, ok } from '@/lib/api/response'
import { BUSINESS, missingBusinessDetails } from '@/lib/config/business'
import { billingRouteError } from '@/lib/billing/http'

// One invoice with the client name and GCO's business identity (and what is still missing from it) for the printable view.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(req, 'BILLING_MANAGE')
    const inv = await db.invoice.findUnique({ where: { id: (await params).id } })
    if (!inv) return fail('Invoice not found', 404)
    const tenant = await db.tenant.findUnique({ where: { id: inv.tenantId }, select: { name: true } })
    return ok({ invoice: inv, client: tenant?.name ?? '', business: BUSINESS, missingBusinessDetails: missingBusinessDetails() })
  } catch (err) {
    return billingRouteError(err)
  }
}
