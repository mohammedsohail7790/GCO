import { describe, it, expect } from 'vitest'
import { resolveRateCard, decideState } from '@/lib/earnings/rates'

const card = (o: Partial<{ id: string; tenantId: string | null; operatorId: string | null; amountEurCents: number; effectiveFrom: string }>) => ({
  id: 'c', tenantId: null, operatorId: null, amountEurCents: 5, basis: 'DELIVERED' as const, ...o, effectiveFrom: new Date(o.effectiveFrom ?? '2026-01-01'),
})
const ctx = (at: string) => ({ tenantId: 't1', operatorId: 'o1', at: new Date(at) })

describe('rate resolution (effective-dated, never rewritten)', () => {
  it('a past message keeps the rate that was in force then, even after a new rate', () => {
    const cards = [card({ id: 'old', amountEurCents: 5, effectiveFrom: '2026-01-01' }), card({ id: 'new', amountEurCents: 8, effectiveFrom: '2026-06-01' })]
    expect(resolveRateCard(cards, ctx('2026-03-01'))!.id).toBe('old')
    expect(resolveRateCard(cards, ctx('2026-07-01'))!.id).toBe('new')
  })
  it('no card yet effective means no rate (never silently zero)', () => {
    expect(resolveRateCard([card({ effectiveFrom: '2026-06-01' })], ctx('2026-03-01'))).toBeNull()
  })
  it('operator-specific beats tenant beats company-wide, regardless of date order', () => {
    const cards = [
      card({ id: 'global', effectiveFrom: '2026-09-01' }),
      card({ id: 'tenant', tenantId: 't1', effectiveFrom: '2026-02-01' }),
      card({ id: 'op', operatorId: 'o1', effectiveFrom: '2026-01-01' }),
    ]
    expect(resolveRateCard(cards, ctx('2026-10-01'))!.id).toBe('op')
  })
  it('ignores cards for other tenants or operators', () => {
    expect(resolveRateCard([card({ tenantId: 'other' }), card({ operatorId: 'x' })], ctx('2026-03-01'))).toBeNull()
  })
})

describe('payable decision', () => {
  it('failed delivery and failed review are never payable', () => {
    expect(decideState({ basis: 'DELIVERED', messageStatus: 'FAILED', reviews: [] }).state).toBe('REJECTED')
    expect(decideState({ basis: 'DELIVERED', messageStatus: 'DELIVERED', reviews: ['FAIL'] }).state).toBe('REJECTED')
  })
  it('sent but undelivered is pending', () => {
    expect(decideState({ basis: 'DELIVERED', messageStatus: 'SENT', reviews: [] }).state).toBe('PENDING')
  })
  it('delivered is payable on the DELIVERED basis', () => {
    expect(decideState({ basis: 'DELIVERED', messageStatus: 'DELIVERED', reviews: [] }).state).toBe('PAYABLE')
  })
  it('the APPROVED basis waits for a PASS or COACHING review', () => {
    expect(decideState({ basis: 'APPROVED', messageStatus: 'DELIVERED', reviews: [] }).state).toBe('PENDING')
    expect(decideState({ basis: 'APPROVED', messageStatus: 'DELIVERED', reviews: ['PASS'] }).state).toBe('PAYABLE')
    expect(decideState({ basis: 'APPROVED', messageStatus: 'DELIVERED', reviews: ['COACHING'] }).state).toBe('PAYABLE')
  })
})
