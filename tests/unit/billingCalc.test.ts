import { describe, it, expect } from 'vitest'
import { buildLines, totals, invoiceNumber, BillingConfigError, type BillingInputs } from '@/lib/billing/calc'
import { isValidItalianVat, missingBusinessDetails, BUSINESS } from '@/lib/config/business'

const base: BillingInputs = { messages: { count: 1000, amountEurCents: 14000 }, tickets: { resolved: 40 }, hours: 120.456, settings: { pricePerTicketEurCents: 250, pricePerHourEurCents: 1800, monthlyFeeEurCents: 500000 } }

describe('invoice lines per billing model', () => {
  it('per message bills the snapshotted amounts, not today\'s price', () => {
    const [l] = buildLines('PER_MESSAGE', base)
    expect(l).toMatchObject({ quantity: 1000, amountEurCents: 14000, unitPriceEurCents: 14 })
  })
  it('per ticket, per hour and monthly use their own price', () => {
    expect(buildLines('PER_TICKET', base)[0]!.amountEurCents).toBe(10000)
    expect(buildLines('PER_HOUR', base)[0]).toMatchObject({ quantity: 120.46, amountEurCents: Math.round(120.46 * 1800) })
    expect(buildLines('MONTHLY_FLAT', base)[0]!.amountEurCents).toBe(500000)
  })
  it('refuses to bill a model whose price is not configured (never silently zero)', () => {
    const s = { ...base.settings, pricePerTicketEurCents: null, pricePerHourEurCents: null, monthlyFeeEurCents: null }
    for (const m of ['PER_TICKET', 'PER_HOUR', 'MONTHLY_FLAT'] as const) expect(() => buildLines(m, { ...base, settings: s })).toThrow(BillingConfigError)
  })
  it('a month with no messages gives a zero line (the service layer then refuses to invoice nothing)', () => {
    expect(buildLines('PER_MESSAGE', { ...base, messages: { count: 0, amountEurCents: 0 } })[0]).toMatchObject({ amountEurCents: 0, unitPriceEurCents: null })
  })
})

describe('totals and numbering', () => {
  it('computes VAT with cent rounding and a total', () => {
    expect(totals([{ description: 'x', quantity: 1, unit: 'u', unitPriceEurCents: 1, amountEurCents: 10001 }], 22)).toEqual({ subtotalEurCents: 10001, vatEurCents: 2200, totalEurCents: 12201 })
    expect(totals([{ description: 'x', quantity: 1, unit: 'u', unitPriceEurCents: 1, amountEurCents: 5000 }], 0).vatEurCents).toBe(0)
  })
  it('formats gap-free numbers per year', () => {
    expect(invoiceNumber(2026, 7)).toBe('GCO-2026-0007')
    expect(invoiceNumber(2027, 1234)).toBe('GCO-2027-1234')
  })
})

describe('business details', () => {
  it('validates the Italian VAT number check digit', () => {
    expect(isValidItalianVat('IT00743110157')).toBe(true) // a well-formed number with a valid check digit
    expect(isValidItalianVat('IT00743110158')).toBe(false)
    expect(isValidItalianVat('IT1234')).toBe(false)
    expect(isValidItalianVat('DE00743110157')).toBe(false)
  })
  it('reports what is still missing until the founder confirms the registration details', () => {
    expect(missingBusinessDetails({ ...BUSINESS, legalName: null, vatNumber: null, taxCode: null, registeredAddress: null })).toHaveLength(4)
    expect(missingBusinessDetails({ ...BUSINESS, legalName: 'X', vatNumber: 'IT00743110157', taxCode: 'Y', registeredAddress: 'Z' })).toEqual([])
  })
})
