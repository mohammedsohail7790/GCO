import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { ok, handleRouteError } from '@/lib/api/response'
import { listFor } from '@/lib/notify/service'

// Always the signed-in user's own notifications.
export async function GET(req: NextRequest) {
  try {
    return ok(await listFor((await getSession(req)).sub))
  } catch (err) {
    return handleRouteError(err)
  }
}
