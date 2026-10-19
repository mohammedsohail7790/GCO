import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { markPayoutPaid } from '@/lib/earnings/ledger'
import { earningsRouteError } from '@/lib/earnings/http'

const Body = z.object({ reference: z.string().max(120).nullable().optional() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'PAYOUT_MANAGE')
    const { id } = await params
    const body = Body.parse(await req.json().catch(() => ({})))
    return ok(await markPayoutPaid({ payoutId: id, reference: body.reference, actorUserId: session.sub }))
  } catch (err) {
    return earningsRouteError(err)
  }
}
