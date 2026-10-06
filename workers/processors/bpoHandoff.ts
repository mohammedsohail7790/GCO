import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { enqueueClientOnboarding } from '@/lib/queue/jobs'
import { runOnboarding } from '@/lib/onboarding/service'

/**
 * "BPO handoff" is GCO's own internal handoff from Sales -> Operations: a
 * Closed-Won deal becomes a real Tenant in GCO's existing conversation-
 * operations system. Idempotent on leadId (Tenant.slug is derived from the
 * lead id, which is unique) - a retried job can never create a second Tenant.
 */
export async function bpoHandoffProcessor(job: Job<{ leadId: string }>) {
  // Same queue, same retry/dead-letter policy: 'onboarding' jobs provision the client user + checklist after the handoff.
  if (job.name === 'onboarding') {
    await runOnboarding(job.data.leadId)
    return
  }
  const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId: job.data.leadId } })
  if (handoff.status === 'SUCCEEDED') {
    // Already handed off: no second tenant. Make sure onboarding was started (idempotent) - covers a crash/queue
    // failure between "tenant created" and "onboarding enqueued".
    await enqueueClientOnboarding(job.data.leadId)
    return
  }

  await db.bpoHandoff.update({
    where: { id: handoff.id },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  })

  const lead = await db.lead.findUniqueOrThrow({ where: { id: handoff.leadId } })

  try {
    const slug = `lead-${lead.id}`.toLowerCase()
    const tenant = await db.tenant.upsert({
      where: { slug },
      update: {},
      create: { name: lead.companyName, slug },
    })

    await db.bpoHandoff.update({
      where: { id: handoff.id },
      data: { status: 'SUCCEEDED', tenantId: tenant.id, processedAt: new Date() },
    })
    await db.commission.updateMany({ where: { leadId: lead.id }, data: { tenantId: tenant.id } })

    await writeAuditLog({
      tenantId: tenant.id,
      action: 'bpo_handoff.succeeded',
      resource: 'bpo_handoff',
      resourceId: handoff.id,
      metadata: { leadId: lead.id },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    await db.bpoHandoff.update({ where: { id: handoff.id }, data: { status: 'FAILED', lastError: message } })
    await writeAuditLog({
      action: 'bpo_handoff.failed',
      resource: 'bpo_handoff',
      resourceId: handoff.id,
      metadata: { leadId: lead.id, error: message },
    })
    throw err // triggers BullMQ retry with backoff; exhausted retries -> dead-letter, per workers/index.ts
  }

  // Outside the try/catch above: the tenant exists and the handoff is SUCCEEDED, so an enqueue problem must not
  // mark the handoff FAILED. If it throws, BullMQ retries this job, which then takes the SUCCEEDED branch above.
  await enqueueClientOnboarding(lead.id)
}
