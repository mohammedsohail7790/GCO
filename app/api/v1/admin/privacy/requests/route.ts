import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createDataRequest } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'PRIVACY_MANAGE')
    const status = new URL(req.url).searchParams.get('status')
    return ok(await db.dataRequest.findMany({ where: status === 'OPEN' || status === 'COMPLETED' || status === 'REJECTED' ? { status } : {}, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 200 }))
  } catch (err) {
    return privacyRouteError(err)
  }
}

const Body = z.object({ tenantId: z.string().max(100), kind: z.enum(['EXPORT', 'ERASURE']), subjectRef: z.string().min(1).max(200), note: z.string().max(500).nullable().optional() }).strict()

// Logged on a client's instruction received outside the portal (email, ticket).
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'PRIVACY_MANAGE')
    return ok(await createDataRequest({ ...Body.parse(await req.json()), requestedByUserId: session.sub }))
  } catch (err) {
    return privacyRouteError(err)
  }
}
