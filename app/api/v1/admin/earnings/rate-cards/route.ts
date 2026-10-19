import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createRateCard } from '@/lib/earnings/ledger'
import { earningsRouteError } from '@/lib/earnings/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'PAYOUT_MANAGE')
    return ok(await db.operatorRateCard.findMany({ orderBy: { effectiveFrom: 'desc' }, take: 200 }))
  } catch (err) {
    return earningsRouteError(err)
  }
}

const Body = z
  .object({
    tenantId: z.string().max(100).nullable().optional(),
    operatorId: z.string().max(100).nullable().optional(),
    amountEurCents: z.number().int().min(0).max(100_000),
    basis: z.enum(['DELIVERED', 'APPROVED']),
    effectiveFrom: z.coerce.date(),
    note: z.string().max(300).nullable().optional(),
  })
  .strict()

// Rates are append-only: a change is a new card with a later effectiveFrom; history is never rewritten.
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PAYOUT_MANAGE')
    const body = Body.parse(await req.json())
    return ok(await createRateCard({ ...body, actorUserId: session.sub }))
  } catch (err) {
    return earningsRouteError(err)
  }
}
