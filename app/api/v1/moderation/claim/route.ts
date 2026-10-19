import { NextRequest } from 'next/server'
import { ok } from '@/lib/api/response'
import { claimBatch } from '@/lib/moderation/service'
import { moderationRouteError, requireModerationOperator } from '@/lib/moderation/http'

// Claims the next items for this operator (never more than 5 held at once) and returns everything they currently hold.
export async function POST(req: NextRequest) {
  try {
    const { operatorId } = await requireModerationOperator(req)
    return ok(await claimBatch(operatorId))
  } catch (err) {
    return moderationRouteError(err)
  }
}
