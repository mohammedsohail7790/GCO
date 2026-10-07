import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { writeAuditLog } from '@/lib/audit/log'
import { enqueueClientOnboarding } from '@/lib/queue/jobs'
import { retryOnboarding } from '@/lib/onboarding/service'

/** Re-runs provisioning (idempotent: continues from whatever step is missing, never duplicates). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'ONBOARDING_MANAGE')
    const { id } = await params
    const ob = await db.clientOnboarding.findUnique({ where: { id } })
    if (!ob) return fail('Onboarding not found', 404)
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const { queued } = await retryOnboarding(ob.id) // manual onboardings complete inline; CRM-originated ones go through the queue
    const job = queued ? await enqueueClientOnboarding(ob.leadId) : null
    await writeAuditLog({ tenantId: ob.tenantId, actorUserId: session.sub, action: 'onboarding.retried', resource: 'client_onboarding', resourceId: ob.id, metadata: { jobId: job?.id ?? null, inline: !queued } })
    return ok({ retried: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
