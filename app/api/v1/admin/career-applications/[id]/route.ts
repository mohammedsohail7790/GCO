import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { CAREER_STATUSES, setApplicationStatus } from '@/lib/careers/applications'

const Schema = z
  .object({
    status: z.enum(CAREER_STATUSES),
    reviewNote: z.string().max(2000).optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'CAREER_MANAGE')
    const { id } = await params
    const body = Schema.parse(await req.json())
    const updated = await setApplicationStatus({ id, status: body.status, reviewNote: body.reviewNote, actorUserId: session.sub })
    if (!updated) return fail('Application not found', 404)
    return ok(updated)
  } catch (err) {
    return handleRouteError(err)
  }
}
