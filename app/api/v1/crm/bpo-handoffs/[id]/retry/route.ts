import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { enqueueBpoHandoff } from '@/lib/queue/jobs'

/**
 * Domain-specific retry for a failed/dead-lettered BPO handoff, by handoff id
 * rather than a raw BullMQ job id (the generic /admin/recovery/requeue-dead-letter
 * endpoint also works for this, keyed by jobId - this is the ergonomic CRM-side
 * equivalent for the "Retry" button on a failed handoff). Re-enqueues using the
 * same deterministic jobId, so this can never create a second Tenant even if
 * clicked more than once.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'BPO_HANDOFF_MANAGE')
    const { id } = await params

    const handoff = await db.bpoHandoff.findUnique({ where: { id } })
    if (!handoff) return fail('BPO handoff not found', 404)
    if (handoff.status === 'SUCCEEDED') return fail('This handoff already succeeded', 409)

    await db.bpoHandoff.update({ where: { id }, data: { status: 'PENDING', lastError: null } })
    const job = await enqueueBpoHandoff(handoff.leadId)

    await writeAuditLog({
      actorUserId: session.sub,
      action: 'bpo_handoff.retried',
      resource: 'bpo_handoff',
      resourceId: id,
      metadata: { leadId: handoff.leadId, jobId: job.id },
    })

    return ok({ retried: true, jobId: job.id })
  } catch (err) {
    return handleRouteError(err)
  }
}
