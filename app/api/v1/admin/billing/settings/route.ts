import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { fail, ok } from '@/lib/api/response'
import { getBillingSettings, updateBillingSettings } from '@/lib/billing/service'
import { billingRouteError } from '@/lib/billing/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'BILLING_MANAGE')
    const tenantId = new URL(req.url).searchParams.get('tenantId')
    if (!tenantId) return fail('tenantId is required', 400)
    return ok(await getBillingSettings(tenantId))
  } catch (err) {
    return billingRouteError(err)
  }
}

const cents = z.number().int().min(0).max(10_000_000)
const Body = z
  .object({
    tenantId: z.string().max(100),
    billingModel: z.enum(['PER_MESSAGE', 'PER_TICKET', 'PER_HOUR', 'MONTHLY_FLAT']).optional(),
    pricePerMessageEurCents: cents.optional(),
    operatorCostPerMessageEurCents: cents.optional(),
    pricePerTicketEurCents: cents.nullable().optional(),
    pricePerHourEurCents: cents.nullable().optional(),
    monthlyFeeEurCents: cents.nullable().optional(),
    vatRatePercent: z.number().int().min(0).max(30).optional(),
    vatNote: z.string().max(300).nullable().optional(),
    paymentTermsDays: z.number().int().min(0).max(120).optional(),
  })
  .strict()

export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    const { tenantId, ...patch } = Body.parse(await req.json())
    if (Object.keys(patch).length === 0) return fail('Nothing to change', 400)
    return ok(await updateBillingSettings(tenantId, patch, session.sub))
  } catch (err) {
    return billingRouteError(err)
  }
}
