import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createRequest } from '@/lib/requests/service'
import { requestRouteError } from '@/lib/requests/http'

// Tenant always comes from the client's session.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'CLIENT_REQUEST_CREATE')
    return ok(await db.clientRequest.findMany({ where: { tenantId: resolveTenantScope(session, null) }, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, kind: true, subject: true, status: true, createdAt: true, updatedAt: true } }))
  } catch (err) {
    return requestRouteError(err)
  }
}

const Body = z.object({ kind: z.enum(['WORKFLOW_CHANGE', 'INSTRUCTION_CHANGE', 'SETTINGS_CHANGE', 'MESSAGE']), subject: z.string().min(3).max(200), body: z.string().min(3).max(5000) }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'CLIENT_REQUEST_CREATE')
    const r = await createRequest({ tenantId: resolveTenantScope(session, null), userId: session.sub, ...Body.parse(await req.json()) })
    return ok({ id: r.id, status: r.status })
  } catch (err) {
    return requestRouteError(err)
  }
}
