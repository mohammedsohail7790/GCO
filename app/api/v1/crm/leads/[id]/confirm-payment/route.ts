import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { confirmFirstPayment, PaymentConfirmationError } from '@/lib/crm/approvals'

// Confirmed business rule: Closed Won alone never makes a commission
// payable - only this explicit confirmation that the client's first-month
// payment was actually received does. Same authority as recording revenue
// (REVENUE_RECORD: MANAGER, CEO_ADMIN) - this is that same class of action.
const Schema = z.object({
  amountEurCents: z.number().int().positive(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'REVENUE_RECORD')
    const { id } = await params
    const body = Schema.parse(await req.json())

    if (
      await isRateLimited(`crm-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    try {
      const result = await confirmFirstPayment(id, session.sub, body.amountEurCents)
      return created(result)
    } catch (err) {
      if (err instanceof PaymentConfirmationError) return fail(err.message, err.status)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
