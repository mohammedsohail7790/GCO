import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { ok, handleRouteError } from '@/lib/api/response'
import { markRead } from '@/lib/notify/service'

const Body = z.object({ ids: z.array(z.string().max(100)).max(100).optional() }).strict()

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    const { ids } = Body.parse(await req.json().catch(() => ({})))
    return ok({ marked: await markRead(session.sub, ids) })
  } catch (err) {
    return handleRouteError(err)
  }
}
