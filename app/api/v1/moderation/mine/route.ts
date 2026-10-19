import { NextRequest } from 'next/server'
import { ok } from '@/lib/api/response'
import { myItems } from '@/lib/moderation/service'
import { db } from '@/lib/db/client'
import { moderationRouteError, requireModerationOperator } from '@/lib/moderation/http'

export async function GET(req: NextRequest) {
  try {
    const { operatorId, tenantId } = await requireModerationOperator(req)
    const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { moderationCategories: true } })
    return ok({ items: await myItems(operatorId), categories: t.moderationCategories })
  } catch (err) {
    return moderationRouteError(err)
  }
}
