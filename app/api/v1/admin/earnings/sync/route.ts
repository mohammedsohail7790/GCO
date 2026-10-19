import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { syncEarnings } from '@/lib/earnings/ledger'
import { earningsRouteError } from '@/lib/earnings/http'

// Brings every operator's ledger up to date (new messages, deliveries, reviews). Idempotent; safe to repeat.
export async function POST(req: NextRequest) {
  try {
    await requirePermission(req, 'PAYOUT_MANAGE')
    const ops = await db.operator.findMany({ select: { id: true } })
    let created = 0, unrated = 0, updated = 0
    for (const o of ops) {
      const r = await syncEarnings(o.id)
      created += r.created; unrated += r.unrated; updated += r.updated
    }
    return ok({ operators: ops.length, created, unrated, updated })
  } catch (err) {
    return earningsRouteError(err)
  }
}
