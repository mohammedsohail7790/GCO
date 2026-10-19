import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok } from '@/lib/api/response'
import { decide } from '@/lib/moderation/service'
import { moderationRouteError, requireModerationOperator } from '@/lib/moderation/http'

const Body = z.object({ verdict: z.enum(['APPROVE', 'REJECT', 'ESCALATE']), category: z.string().max(40).nullable().optional(), note: z.string().max(2000).nullable().optional() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, operatorId } = await requireModerationOperator(req)
    return ok(await decide({ operatorId, userId: session.sub, itemId: (await params).id, ...Body.parse(await req.json()) }))
  } catch (err) {
    return moderationRouteError(err)
  }
}
