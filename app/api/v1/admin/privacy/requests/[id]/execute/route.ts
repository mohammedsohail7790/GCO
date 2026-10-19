import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { executeDataRequest } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

// The subject reference is re-entered here and checked against the stored hash. An export is returned once and never stored.
const Body = z.object({ subjectRef: z.string().min(1).max(200) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'PRIVACY_MANAGE')
    const res = await executeDataRequest({ requestId: (await params).id, subjectRef: Body.parse(await req.json()).subjectRef, actorUserId: session.sub })
    return ok(res)
  } catch (err) {
    return privacyRouteError(err)
  }
}
