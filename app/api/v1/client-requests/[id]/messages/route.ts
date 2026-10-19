import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { addMessage, setStatus, thread } from '@/lib/requests/service'
import { requestRouteError } from '@/lib/requests/http'

async function scoped(req: NextRequest, id: string) {
  const session = await requirePermission(req, 'CLIENT_REQUEST_MANAGE')
  const r = await db.clientRequest.findUnique({ where: { id }, select: { tenantId: true } })
  if (!r) return { error: fail('Request not found', 404) }
  const tenantId = resolveTenantScope(session, r.tenantId)
  if (tenantId !== r.tenantId) return { error: fail('Request not found', 404) }
  return { session, tenantId }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const s = await scoped(req, id)
    if ('error' in s) return s.error
    return ok(await thread(id, s.tenantId))
  } catch (err) {
    return requestRouteError(err)
  }
}

const Reply = z.object({ body: z.string().min(1).max(5000) }).strict()
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const s = await scoped(req, id)
    if ('error' in s) return s.error
    await addMessage({ requestId: id, tenantId: s.tenantId, userId: s.session.sub, fromClient: false, body: Reply.parse(await req.json()).body })
    return ok({ sent: true })
  } catch (err) {
    return requestRouteError(err)
  }
}

const Status = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'DECLINED']), note: z.string().max(5000).nullable().optional() }).strict()
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const s = await scoped(req, id)
    if ('error' in s) return s.error
    await setStatus({ requestId: id, tenantId: s.tenantId, userId: s.session.sub, ...Status.parse(await req.json()) })
    return ok({ updated: true })
  } catch (err) {
    return requestRouteError(err)
  }
}
