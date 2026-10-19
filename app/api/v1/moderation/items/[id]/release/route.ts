import { NextRequest } from 'next/server'
import { ok } from '@/lib/api/response'
import { releaseItem } from '@/lib/moderation/service'
import { moderationRouteError, requireModerationOperator } from '@/lib/moderation/http'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { operatorId } = await requireModerationOperator(req)
    await releaseItem(operatorId, (await params).id)
    return ok({ released: true })
  } catch (err) {
    return moderationRouteError(err)
  }
}
