import { db } from '@/lib/db/client'

/**
 * Records exactly one billable usage entry per message, keyed by a unique
 * idempotency key. Safe to call multiple times for the same message (e.g.
 * retried queue job) - the unique constraint on `messageId` / `idempotencyKey`
 * makes the second call a no-op rather than double billing.
 */
export async function recordMessageUsage(params: {
  tenantId: string
  messageId: string
  source: string
  priceEurCents: number
  operatorCostEurCents: number
}) {
  const idempotencyKey = `usage:${params.messageId}`

  const existing = await db.usageRecord.findUnique({ where: { messageId: params.messageId } })
  if (existing) return existing

  try {
    return await db.usageRecord.create({
      data: {
        tenantId: params.tenantId,
        messageId: params.messageId,
        eventType: 'message_processed',
        billable: true,
        priceEurCents: params.priceEurCents,
        operatorCostEurCents: params.operatorCostEurCents,
        idempotencyKey,
        source: params.source,
      },
    })
  } catch (err) {
    // Unique constraint race: another process recorded it first between our
    // check and create - fetch and return the existing row instead of failing.
    const race = await db.usageRecord.findUnique({ where: { messageId: params.messageId } })
    if (race) return race
    throw err
  }
}
