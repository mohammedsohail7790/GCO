import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createDataRequest } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

// A client (data controller) instructs GCO (processor) to export or erase one of ITS end users' data. Tenant comes from the session.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'DATA_REQUEST_CREATE')
    const tenantId = resolveTenantScope(session, null)
    return ok(await db.dataRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, subjectHint: true, status: true, dueAt: true, completedAt: true, createdAt: true } }))
  } catch (err) {
    return privacyRouteError(err)
  }
}

const Body = z.object({ kind: z.enum(['EXPORT', 'ERASURE']), subjectRef: z.string().min(1).max(200), note: z.string().max(500).nullable().optional() }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'DATA_REQUEST_CREATE')
    const tenantId = resolveTenantScope(session, null)
    const r = await createDataRequest({ tenantId, ...Body.parse(await req.json()), requestedByUserId: session.sub })
    return ok({ id: r.id, status: r.status, dueAt: r.dueAt })
  } catch (err) {
    return privacyRouteError(err)
  }
}
