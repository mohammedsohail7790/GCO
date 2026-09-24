import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { ok, handleRouteError } from '@/lib/api/response'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_VIEW_OWN') // Hunters are the ones booking closing calls

    const bookingUrl = getCalendarProvider().getBookingUrl()
    return ok({ configured: bookingUrl !== null, bookingUrl })
  } catch (err) {
    return handleRouteError(err)
  }
}
