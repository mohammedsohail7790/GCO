// How an operator sees the delivery state of a message they sent. Pure and shared by the operator workspace and its tests.
// Outbound messages start PENDING_REVIEW when created by operatorSendMessage, become DELIVERED when the client platform
// acknowledges (2xx), or FAILED when delivery gives up (workers/processors/outboundDelivery.ts). Inbound messages have no delivery state.

export type DeliveryTone = 'neutral' | 'ok' | 'error'
export interface DeliveryLabel { text: string; tone: DeliveryTone }

export function deliveryLabel(direction: 'INBOUND' | 'OUTBOUND', status: string): DeliveryLabel | null {
  if (direction !== 'OUTBOUND') return null
  switch (status) {
    case 'DELIVERED':
      return { text: 'Delivered', tone: 'ok' }
    case 'SENT':
      return { text: 'Sent', tone: 'neutral' }
    case 'FAILED':
      return { text: 'Not delivered - tell your supervisor', tone: 'error' }
    default:
      // PENDING_REVIEW (and anything unexpected): not yet acknowledged by the client platform.
      return { text: 'Sending...', tone: 'neutral' }
  }
}
