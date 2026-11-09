export type Model = 'PER_MESSAGE' | 'PER_TICKET' | 'PER_HOUR' | 'MONTHLY_FLAT' | 'HOURLY_PLUS_TICKETS'

export interface InvoiceLine { description: string; quantity: number; unit: string; unitPriceEurCents: number | null; amountEurCents: number }

export interface BillingInputs {
  /** Sum of the per-message prices snapshotted in the usage ledger (cents) and how many billable messages. */
  messages: { count: number; amountEurCents: number }
  /** Completed eligible tickets: GCO conversations first resolved in the period with an operator reply, plus counts recorded from the client's own tool. */
  tickets: { resolved: number }
  /** Scheduled shift hours net of absences. */
  hours: number
  /** Moderation items decided in the period. */
  moderated: number
  settings: { pricePerTicketEurCents: number | null; pricePerHourEurCents: number | null; monthlyFeeEurCents: number | null; includedTicketsPerPeriod: number | null; pricePerModeratedItemEurCents: number | null }
}

export class BillingConfigError extends Error {}

/**
 * Pure: the invoice lines for one billing model, plus a moderation line under any model when a moderation price is set. Throws when
 * the model's price is not configured - never invoices at zero by accident.
 */
export function buildLines(model: Model, i: BillingInputs): InvoiceLine[] {
  const lines = modelLines(model, i)
  const m = i.settings.pricePerModeratedItemEurCents
  if (m !== null && i.moderated > 0) lines.push({ description: 'Moderated items', quantity: i.moderated, unit: 'item', unitPriceEurCents: m, amountEurCents: i.moderated * m })
  return lines
}

function hourLine(i: BillingInputs): InvoiceLine {
  const p = i.settings.pricePerHourEurCents
  if (p === null) throw new BillingConfigError('Set an hourly price for this client first')
  const hours = Math.round(i.hours * 100) / 100
  return { description: 'Scheduled operator hours', quantity: hours, unit: 'hour', unitPriceEurCents: p, amountEurCents: Math.round(hours * p) }
}

function modelLines(model: Model, i: BillingInputs): InvoiceLine[] {
  switch (model) {
    case 'PER_MESSAGE':
      // Each message keeps the price it was billed at when it was processed, so a later price change never rewrites history.
      return [{ description: 'Handled messages', quantity: i.messages.count, unit: 'message', unitPriceEurCents: i.messages.count ? Math.round(i.messages.amountEurCents / i.messages.count) : null, amountEurCents: i.messages.amountEurCents }]
    case 'PER_TICKET': {
      const p = i.settings.pricePerTicketEurCents
      if (p === null) throw new BillingConfigError('Set a price per ticket for this client first')
      return [{ description: 'Completed tickets', quantity: i.tickets.resolved, unit: 'ticket', unitPriceEurCents: p, amountEurCents: i.tickets.resolved * p }]
    }
    case 'PER_HOUR':
      return [hourLine(i)]
    case 'HOURLY_PLUS_TICKETS': {
      const p = i.settings.pricePerTicketEurCents
      if (p === null) throw new BillingConfigError('Set a price per ticket above the included volume first')
      const included = i.settings.includedTicketsPerPeriod ?? 0
      const extra = Math.max(0, i.tickets.resolved - included)
      return [hourLine(i), { description: `Tickets above the ${included} included (${i.tickets.resolved} completed)`, quantity: extra, unit: 'ticket', unitPriceEurCents: p, amountEurCents: extra * p }]
    }
    case 'MONTHLY_FLAT': {
      const p = i.settings.monthlyFeeEurCents
      if (p === null) throw new BillingConfigError('Set the monthly fee for this client first')
      return [{ description: 'Monthly service fee', quantity: 1, unit: 'month', unitPriceEurCents: p, amountEurCents: p }]
    }
  }
}

export function totals(lines: InvoiceLine[], vatRatePercent: number) {
  const subtotal = lines.reduce((a, l) => a + l.amountEurCents, 0)
  const vat = Math.round((subtotal * vatRatePercent) / 100)
  return { subtotalEurCents: subtotal, vatEurCents: vat, totalEurCents: subtotal + vat }
}

export const invoiceNumber = (year: number, n: number) => `GCO-${year}-${String(n).padStart(4, '0')}`
