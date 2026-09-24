import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { submitForApproval, ApprovalError } from '@/lib/crm/approvals'
import { InvalidStageTransitionError } from '@/lib/crm/leads'

const Schema = z.object({ reason: z.string().max(2000).optional() })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'APPROVAL_SUBMIT')
    const { id } = await params
    const body = Schema.parse(await req.json())

    try {
      const approval = await submitForApproval(id, session.sub, body.reason)
      return created(approval)
    } catch (err) {
      if (err instanceof ApprovalError) return fail(err.message, err.status)
      if (err instanceof InvalidStageTransitionError) return fail(err.message, err.status)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
