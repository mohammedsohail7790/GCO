import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok } from '@/lib/api/response'
import { addMessage, thread } from '@/lib/requests/service'
import { requestRouteError } from '@/lib/requests/http'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CLIENT_REQUEST_CREATE')
    return ok(await thread((await params).id, resolveTenantScope(session, null)))
  } catch (err) {
    return requestRouteError(err)
  }
}

const Body = z.object({ body: z.string().min(1).max(5000) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'CLIENT_REQUEST_CREATE')
    await addMessage({ requestId: (await params).id, tenantId: resolveTenantScope(session, null), userId: session.sub, fromClient: true, body: Body.parse(await req.json()).body })
    return ok({ sent: true })
  } catch (err) {
    return requestRouteError(err)
  }
}
