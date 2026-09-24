import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { changeStage, InvalidStageTransitionError } from '@/lib/crm/leads'

const Schema = z.object({
  stage: z.enum(['CONTACTED', 'ENGAGED', 'QUALIFIED', 'MEETING_BOOKED', 'PROPOSAL', 'CLOSED_LOST']),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const lead = await db.lead.findUnique({ where: { id } })
    if (!lead) return fail('Lead not found', 404)
    if (session.role === 'HUNTER' && lead.ownerId !== session.sub) return fail('Forbidden', 403)

    const body = Schema.parse(await req.json())
    try {
      await changeStage(id, session.sub, body.stage)
    } catch (err) {
      if (err instanceof InvalidStageTransitionError) return fail(err.message, err.status)
      throw err
    }

    return ok(await db.lead.findUniqueOrThrow({ where: { id } }))
  } catch (err) {
    return handleRouteError(err)
  }
}
