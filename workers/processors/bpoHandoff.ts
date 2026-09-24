import type { Job } from 'bullmq'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'

/**
 * "BPO handoff" is GCO's own internal handoff from Sales -> Operations: a
 * Closed-Won deal becomes a real Tenant in GCO's existing conversation-
 * operations system. Idempotent on leadId (Tenant.slug is derived from the
 * lead id, which is unique) - a retried job can never create a second Tenant.
 */
export async function bpoHandoffProcessor(job: Job<{ leadId: string }>) {
  const handoff = await db.bpoHandoff.findUniqueOrThrow({ where: { leadId: job.data.leadId } })
  if (handoff.status === 'SUCCEEDED') return // already handed off, safe no-op on retry

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
}
