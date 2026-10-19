import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok } from '@/lib/api/response'
import { anonymiseUser } from '@/lib/privacy/service'
import { privacyRouteError } from '@/lib/privacy/http'

const Body = z.object({ reason: z.string().min(5).max(300) }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'PRIVACY_MANAGE')
    await anonymiseUser({ userId: (await params).id, reason: Body.parse(await req.json()).reason, actorUserId: session.sub })
    return ok({ anonymised: true })
  } catch (err) {
    return privacyRouteError(err)
  }
}
