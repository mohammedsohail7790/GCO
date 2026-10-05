import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { ok, handleRouteError } from '@/lib/api/response'
import { getEscalation } from '@/lib/escalation/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession(req)
    return ok(await getEscalation(session, id))
  } catch (err) {
    return handleRouteError(err)
  }
}
