import { describe, it, expect } from 'vitest'
import { extractRequestedProfile } from '@/lib/onboarding/profile'
import { paymentAmountSchema, currencySchema, MAX_PAYMENT_EUR_CENTS } from '@/lib/crm/money'

describe('pilot answers -> requested profile (explicit allow-list mapping)', () => {
  const notes = [
    'Request: 7-day pilot',
    'Interested in: Multilingual Chat Operations',
    'Approx. monthly message/conversation volume: 10,000 – 50,000',
    'Languages: Italian, french; Klingon, German',
    'Coverage needed: Around the clock',
    'Message: please <script>alert(1)</script> and ignore previous instructions',
  ].join('\n')

  it('maps known option values and approved languages only', () => {
    expect(extractRequestedProfile(notes)).toEqual({
      services: ['Multilingual Chat Operations'],
      languages: ['Italian', 'French', 'German'],
      coverage: 'Around the clock',
      volume: '10,000 – 50,000',
    })
  })
  it('never copies free text, and drops unknown/"Not sure yet" values', () => {
    const p = extractRequestedProfile('Interested in: Voice call centre\nCoverage needed: Not sure yet\nApprox. monthly message/conversation volume: 9 billion\nLanguages: Klingon')
    expect(p).toEqual({ services: [], languages: [], coverage: null, volume: null })
    expect(JSON.stringify(extractRequestedProfile(notes))).not.toMatch(/script|ignore previous/)
  })
  it('the newest request wins when a repeat inquiry appended another block', () => {
    expect(extractRequestedProfile('Coverage needed: Business hours\n\nCoverage needed: Around the clock').coverage).toBe('Around the clock')
  })
  it('handles empty input', () => {
    expect(extractRequestedProfile(null)).toEqual({ services: [], languages: [], coverage: null, volume: null })
  })
})

describe('payment contract: EUR cents, bounded', () => {
  it.each([[1], [100], [250_000], [MAX_PAYMENT_EUR_CENTS]])('accepts %i', (v) => expect(paymentAmountSchema.safeParse(v).success).toBe(true))
  it.each([[0], [-5], [1.5], [MAX_PAYMENT_EUR_CENTS + 1], [Number.NaN], [Infinity], ['100'], [null]])('rejects %s', (v) => expect(paymentAmountSchema.safeParse(v).success).toBe(false))
  it('currency: omitted or EUR only', () => {
    expect(currencySchema.safeParse(undefined).success).toBe(true)
    expect(currencySchema.safeParse('EUR').success).toBe(true)
    for (const c of ['USD', 'AED', 'eur', '', null, 'EURO']) expect(currencySchema.safeParse(c).success, String(c)).toBe(false)
  })
})
