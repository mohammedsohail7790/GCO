import { describe, it, expect } from 'vitest'
import { UpdateDiscoverySchema, DISCOVERY_SECTIONS, daysSince } from '@/lib/crm/discovery'

describe('discovery payload validation', () => {
  it('accepts the documented sections, qualification values, next action and date', () => {
    const r = UpdateDiscoverySchema.safeParse({
      qualification: 'NEEDS_FOLLOW_UP',
      nextAction: 'Send the proposal',
      nextActionAt: '2026-10-20T09:00:00.000Z',
      discovery: { business: { company: 'Acme', pain: 'slow replies' }, technical: { channelProvider: 'in-app chat' } },
    })
    expect(r.success).toBe(true)
  })
  it('accepts null to clear qualification / next action', () => {
    expect(UpdateDiscoverySchema.safeParse({ qualification: null, nextAction: null, nextActionAt: null }).success).toBe(true)
  })
  it.each([
    [{ qualification: 'MAYBE' }], [{ nextActionAt: 'tomorrow' }], [{ nextAction: 'x'.repeat(201) }], [{ discovery: { business: { company: 'x'.repeat(301) } } }],
    [{ discovery: { business: { notARealField: 'x' } } }], [{ discovery: { secrets: { apiKey: 'x' } } }], [{ score: 90 }], [{ ownerId: 'someone' }], [{ pipelineStage: 'CLOSED_WON' }],
  ])('rejects %j (strict: no extra keys, no stage/owner changes through this endpoint)', (body) => expect(UpdateDiscoverySchema.safeParse(body).success).toBe(false))

  it('covers the four playbook sections with no credential-shaped field names', () => {
    expect(Object.keys(DISCOVERY_SECTIONS)).toEqual(['business', 'operations', 'technical', 'commercial'])
    const all = Object.values(DISCOVERY_SECTIONS).flat().join(' ')
    expect(all).not.toMatch(/password|secret|token|apiKey|credential/i)
  })
  it('daysSince is whole days, never negative, null when unknown', () => {
    const now = new Date('2026-10-10T12:00:00Z')
    expect(daysSince(new Date('2026-10-07T13:00:00Z'), now)).toBe(2)
    expect(daysSince(new Date('2026-10-11T00:00:00Z'), now)).toBe(0)
    expect(daysSince(null, now)).toBeNull()
  })
})
