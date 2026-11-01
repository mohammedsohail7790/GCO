import { db } from '@/lib/db/client'
import { reconcile } from '@/lib/billing/service'
import { toCsv, type CsvCell } from './csv'
import type { ExportRequest } from './link'

// Hard ceiling so one request cannot pull an unbounded table; the caller is told to narrow the period.
export const EXPORT_MAX_ROWS = 50_000
export class ExportTooLargeError extends Error {}

export async function buildExport(r: ExportRequest): Promise<{ filename: string; csv: string; rowCount: number }> {
  const from = new Date(r.from)
  const to = new Date(r.to)
  const inP = { gte: from, lt: to }
  const name = `gco-${r.kind}-${r.from.slice(0, 10)}-to-${r.to.slice(0, 10)}.csv`
  let headers: string[]
  let rows: CsvCell[][]

  if (r.kind === 'usage') {
    if ((await db.usageRecord.count({ where: { tenantId: r.tenantId, createdAt: inP } })) > EXPORT_MAX_ROWS) throw new ExportTooLargeError()
    const data = await db.usageRecord.findMany({ where: { tenantId: r.tenantId, createdAt: inP }, orderBy: { createdAt: 'asc' } })
    headers = ['createdAt', 'messageId', 'eventType', 'billable', 'priceEurCents', 'operatorCostEurCents', 'source']
    rows = data.map((u) => [u.createdAt, u.messageId, u.eventType, u.billable, u.priceEurCents, u.operatorCostEurCents, u.source])
  } else if (r.kind === 'invoices') {
    const data = await db.invoice.findMany({ where: { tenantId: r.tenantId, periodStart: { lt: to }, periodEnd: { gt: from } }, orderBy: { periodStart: 'asc' }, take: EXPORT_MAX_ROWS })
    headers = ['number', 'status', 'periodStart', 'periodEnd', 'billingModel', 'subtotalEurCents', 'vatRatePercent', 'vatEurCents', 'totalEurCents', 'issuedAt', 'dueAt', 'paidAt', 'paymentReference']
    rows = data.map((i) => [i.number, i.status, i.periodStart, i.periodEnd, i.billingModel, i.subtotalEurCents, i.vatRatePercent, i.vatEurCents, i.totalEurCents, i.issuedAt, i.dueAt, i.paidAt, i.paymentReference])
  } else if (r.kind === 'operator-earnings') {
    if ((await db.operatorEarningLine.count({ where: { tenantId: r.tenantId, messageAt: inP } })) > EXPORT_MAX_ROWS) throw new ExportTooLargeError()
    const data = await db.operatorEarningLine.findMany({ where: { tenantId: r.tenantId, messageAt: inP }, orderBy: { messageAt: 'asc' } })
    headers = ['messageAt', 'operatorId', 'messageId', 'rateEurCents', 'basis', 'state', 'stateReason', 'payoutId']
    rows = data.map((l) => [l.messageAt, l.operatorId, l.messageId, l.rateEurCents, l.basis, l.state, l.stateReason, l.payoutId])
  } else {
    // reconciliation: the screen's figures, flattened to metric/value rows so the totals can be compared line by line
    const x = await reconcile(r.tenantId, from, to)
    headers = ['metric', 'value']
    rows = [
      ['billableMessages', x.activity.billableMessages],
      ['customerMessagesReceived', x.activity.customerMessagesReceived],
      ['billedPerUsageEurCents', x.clientBilling.billedPerUsageEurCents],
      ['invoicedSubtotalEurCents', x.clientBilling.invoicedSubtotalEurCents],
      ['operatorLedgerCostEurCents', x.operatorCompensation.ledgerCostEurCents],
      ['operatorOwedEurCents', x.operatorCompensation.owedEurCents],
      ['payableMessages', x.operatorCompensation.payableMessages],
      ['pendingMessages', x.operatorCompensation.pendingMessages],
      ['rejectedMessages', x.operatorCompensation.rejectedMessages],
      ['marginGrossEurCents', x.margin.grossEurCents],
      ['marginGrossPercent', x.margin.grossPercent],
      ['receivedWithoutUsageRecord', x.mismatches.receivedWithoutUsageRecord],
      ['deliveredWithoutEarningLine', x.mismatches.deliveredWithoutEarningLine],
      ['usageVsInvoiceDifferenceEurCents', x.mismatches.usageVsInvoiceDifferenceEurCents],
    ]
  }
  return { filename: name, csv: toCsv(headers, rows), rowCount: rows.length }
}
