import { describe, it, expect } from 'vitest'
import { deliveryLabel } from '@/lib/messages/deliveryStatus'

describe('deliveryLabel', () => {
  it('shows nothing for inbound messages', () => {
    expect(deliveryLabel('INBOUND', 'RECEIVED')).toBeNull()
  })
  it('maps every outbound status to a label an operator can act on', () => {
    expect(deliveryLabel('OUTBOUND', 'PENDING_REVIEW')).toEqual({ text: 'Sending...', tone: 'neutral' })
    expect(deliveryLabel('OUTBOUND', 'SENT')).toEqual({ text: 'Sent', tone: 'neutral' })
    expect(deliveryLabel('OUTBOUND', 'DELIVERED')).toEqual({ text: 'Delivered', tone: 'ok' })
  })
  it('flags a failed delivery as an error and tells the operator what to do', () => {
    const l = deliveryLabel('OUTBOUND', 'FAILED')!
    expect(l.tone).toBe('error')
    expect(l.text).toMatch(/supervisor/i)
  })
  it('treats an unknown outbound status as not yet confirmed, never as delivered', () => {
    expect(deliveryLabel('OUTBOUND', 'SOMETHING_NEW')).toEqual({ text: 'Sending...', tone: 'neutral' })
  })
})
