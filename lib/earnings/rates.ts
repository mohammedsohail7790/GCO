import type { PayableBasis } from '@prisma/client'

export interface RateCardLike {
  id: string
  tenantId: string | null
  operatorId: string | null
  amountEurCents: number
  basis: PayableBasis
  effectiveFrom: Date
}

/**
 * Pure rate resolution. A card applies if it is effective at `at` and matches the tenant/operator (or is a
 * wildcard). The most specific card wins (operator > tenant > company-wide); among equally specific cards the
 * latest effectiveFrom wins. Cards are never edited, so a past message always resolves to the rate that
 * was in force when it was written.
 */
export function resolveRateCard<T extends RateCardLike>(cards: readonly T[], ctx: { tenantId: string; operatorId: string; at: Date }): T | null {
  const specificity = (c: RateCardLike) => (c.operatorId ? 2 : 0) + (c.tenantId ? 1 : 0)
  let best: T | null = null
  for (const c of cards) {
    if (c.effectiveFrom.getTime() > ctx.at.getTime()) continue
    if (c.tenantId && c.tenantId !== ctx.tenantId) continue
    if (c.operatorId && c.operatorId !== ctx.operatorId) continue
    if (
      !best ||
      specificity(c) > specificity(best) ||
      (specificity(c) === specificity(best) && c.effectiveFrom.getTime() > best.effectiveFrom.getTime())
    ) {
      best = c
    }
  }
  return best
}

export type LineState = 'PENDING' | 'PAYABLE' | 'REJECTED'

/**
 * Pure payable decision for one operator message.
 *  - a failed delivery or a FAIL review is never payable;
 *  - basis DELIVERED: payable once delivered;
 *  - basis APPROVED: payable once delivered AND reviewed PASS/COACHING;
 *  - anything else stays pending.
 */
export function decideState(input: {
  basis: PayableBasis
  messageStatus: 'RECEIVED' | 'PENDING_REVIEW' | 'SENT' | 'DELIVERED' | 'FAILED'
  reviews: readonly ('PASS' | 'COACHING' | 'FAIL')[]
}): { state: LineState; reason: string | null } {
  if (input.messageStatus === 'FAILED') return { state: 'REJECTED', reason: 'delivery failed' }
  if (input.reviews.includes('FAIL')) return { state: 'REJECTED', reason: 'rejected in quality review' }
  if (input.messageStatus !== 'DELIVERED') return { state: 'PENDING', reason: 'awaiting delivery' }
  if (input.basis === 'APPROVED' && input.reviews.length === 0) return { state: 'PENDING', reason: 'awaiting quality approval' }
  return { state: 'PAYABLE', reason: null }
}
