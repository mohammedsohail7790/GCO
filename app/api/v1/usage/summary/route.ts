import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, handleRouteError } from '@/lib/api/response'
import { defaults } from '@/lib/config/flags'

/**
 * Usage/billing summary, computed from the UsageRecord ledger (the auditable
 * source of truth - never from ad-hoc message counts). Revenue/margin figures
 * are only included for callers with VIEW_REVENUE permission.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))

    const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : new Date(Date.now() - 30 * 86400_000)
    const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date()

    const records = await db.usageRecord.findMany({
      where: { tenantId, billable: true, createdAt: { gte: from, lte: to } },
    })

    const messageCount = records.length
    const totalPriceEurCents = records.reduce((sum, r) => sum + r.priceEurCents, 0)
    const totalOperatorCostEurCents = records.reduce((sum, r) => sum + r.operatorCostEurCents, 0)

    const summary: Record<string, unknown> = {
      tenantId,
      from,
      to,
      messageCount,
      totalPriceEur: totalPriceEurCents / 100,
    }

    if (can(session.role, 'VIEW_REVENUE')) {
      const grossMarginEurCents = totalPriceEurCents - totalOperatorCostEurCents
      const founderShareEurCents = Math.round(
        (grossMarginEurCents * defaults.founderRevenueSharePercent) / 100,
      )
      summary.totalOperatorCostEur = totalOperatorCostEurCents / 100
      summary.grossMarginEur = grossMarginEurCents / 100
      summary.founderRevenueShareEur = founderShareEurCents / 100
    }

    return ok(summary)
  } catch (err) {
    return handleRouteError(err)
  }
}
