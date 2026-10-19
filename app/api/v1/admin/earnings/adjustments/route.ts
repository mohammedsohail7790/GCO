import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { createAdjustment } from '@/lib/earnings/ledger'
import { earningsRouteError } from '@/lib/earnings/http'

const Body = z
  .object({
    operatorId: z.string().max(100),
    amountEurCents: z.number().int().refine((n) => n !== 0, 'must not be zero'),
    reason: z.string().min(5).max(500),
    lineId: z.string().max(100).nullable().optional(),
  })
  .strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PAYOUT_MANAGE')
    const body = Body.parse(await req.json())
    return ok(await createAdjustment({ ...body, actorUserId: session.sub }))
  } catch (err) {
    return earningsRouteError(err)
  }
}
