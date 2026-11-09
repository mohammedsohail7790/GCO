import { describe, it, expect } from 'vitest'
import { maskPersonalData } from '@/lib/ai/redact'

describe('masking personal data before AI', () => {
  it('masks emails, phone numbers, IBANs and long numbers', () => {
    expect(maskPersonalData('Write to anna.rossi+shop@example.co.uk please')).toBe('Write to [email] please')
    expect(maskPersonalData('Call me on +39 347 123 4567 or (02) 1234-5678')).toBe('Call me on [phone] or [phone]')
    expect(maskPersonalData('My IBAN is IT60X0542811101000000123456')).toBe('My IBAN is [iban]')
    // A card number is masked (it matches the phone pattern first; the label does not matter, the digits are gone)
    expect(maskPersonalData('Card 4111111111111111, order 1234567')).toBe('Card [phone], order [number]')
  })
  it('keeps short numbers, prices, dates, times and order references with letters', () => {
    const text = 'Order ORD-4521 for 2 items, €49.90, delivered 12/11/2026 (or 12.11.2026) at 14:30, I am 34'
    expect(maskPersonalData(text)).toBe(text)
  })
  it('leaves text without personal data unchanged', () => {
    expect(maskPersonalData('Hello, where is my parcel?')).toBe('Hello, where is my parcel?')
  })
})
