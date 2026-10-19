import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { billingRouteError } from '@/lib/billing/http'

// A client sees only its own ISSUED and PAID invoices (never drafts or voided ones); tenant comes from the session.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'INVOICE_VIEW_OWN')
    const tenantId = resolveTenantScope(session, null)
    const rows = await db.invoice.findMany({ where: { tenantId, status: { in: ['ISSUED', 'PAID'] } }, orderBy: { issuedAt: 'desc' }, take: 100 })
    return ok(rows.map((i) => ({ id: i.id, number: i.number, status: i.status, periodStart: i.periodStart, periodEnd: i.periodEnd, lines: i.lines, subtotalEurCents: i.subtotalEurCents, vatRatePercent: i.vatRatePercent, vatEurCents: i.vatEurCents, totalEurCents: i.totalEurCents, vatNote: i.vatNote, issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt })))
  } catch (err) {
    return billingRouteError(err)
  }
}
