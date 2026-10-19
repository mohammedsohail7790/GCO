import { describe, it, expect } from 'vitest'
import { validateWizard, type WizardInput } from '@/lib/onboarding/wizard'

const ok: WizardInput = {
  company: { name: 'Acme Shop', slug: 'acme-shop' }, industry: 'ECOMMERCE', services: ['LIVE_CHAT_SUPPORT'], languages: ['en', 'es'], timezone: 'Europe/Rome', operatingHours: null,
  responseSlaSeconds: 120, operatorCapacity: 2, messageCap: null,
  billing: { model: 'PER_MESSAGE', pricePerMessageEurCents: 14, pricePerTicketEurCents: null, pricePerHourEurCents: null, monthlyFeeEurCents: null, vatRatePercent: 22, vatNote: null },
  operatorPay: { amountEurCents: 6, basis: 'DELIVERED' }, aiMode: 'AI_ASSISTED', requireOperatorApproval: false,
  clientContact: { email: 'owner@acme.test', name: 'Owner' }, staff: [{ email: 'm@gco.test', name: 'M', role: 'MANAGER' }],
}
const bad = (patch: Partial<WizardInput>) => validateWizard({ ...ok, ...patch })

describe('client setup wizard validation', () => {
  it('accepts a complete setup', () => expect(validateWizard(ok)).toEqual([]))
  it('needs a company, a clean short name and at least one service', () => {
    expect(bad({ company: { name: 'A', slug: 'ok-slug' } }).join()).toMatch(/company name/)
    expect(bad({ company: { name: 'Acme', slug: 'Bad Slug!' } }).join()).toMatch(/short name/)
    expect(bad({ services: [] }).join()).toMatch(/at least one service/)
  })
  it('checks languages, timezone, hours, SLA and capacity', () => {
    expect(bad({ languages: ['english'] }).join()).toMatch(/two-letter/)
    expect(bad({ timezone: 'Mars/Phobos' }).join()).toMatch(/timezone/)
    expect(bad({ operatingHours: { mon: { open: '18:00', close: '09:00' } } }).join()).toMatch(/Closing time/)
    expect(bad({ responseSlaSeconds: 5 }).join()).toMatch(/30-3600/)
    expect(bad({ operatorCapacity: 0 }).join()).toMatch(/1-20/)
  })
  it('requires the price of the chosen billing model', () => {
    const b = ok.billing
    expect(bad({ billing: { ...b, model: 'PER_TICKET' } }).join()).toMatch(/per ticket/)
    expect(bad({ billing: { ...b, model: 'PER_HOUR' } }).join()).toMatch(/per hour/)
    expect(bad({ billing: { ...b, model: 'MONTHLY_FLAT' } }).join()).toMatch(/monthly fee/)
    expect(bad({ billing: { ...b, vatRatePercent: 50 } }).join()).toMatch(/VAT/)
  })
  it('does not offer AI + Human yet', () => expect(bad({ aiMode: 'AI_PLUS_HUMAN' }).join()).toMatch(/not available yet/))
  it('rejects bad, demo and duplicate emails', () => {
    expect(bad({ clientContact: { email: 'nope', name: 'x' } }).join()).toMatch(/Invalid email/)
    expect(bad({ staff: [{ email: 'x@demo.gco', name: 'x', role: 'OPERATOR' }] }).join()).toMatch(/Invalid email/)
    expect(bad({ staff: [{ email: 'owner@acme.test', name: 'x', role: 'OPERATOR' }] }).join()).toMatch(/twice/)
  })
})
