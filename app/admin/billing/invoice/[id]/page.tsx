'use client'

import { useEffect, useState, use } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Data {
  invoice: { number: string | null; status: string; periodStart: string; periodEnd: string; lines: { description: string; quantity: number; unit: string; unitPriceEurCents: number | null; amountEurCents: number }[]; subtotalEurCents: number; vatRatePercent: number; vatEurCents: number; totalEurCents: number; vatNote: string | null; issuedAt: string | null; dueAt: string | null }
  client: string
  business: { tradingName: string; legalName: string | null; vatNumber: string | null; taxCode: string | null; registeredAddress: string | null; invoiceEmail: string }
  missingBusinessDetails: string[]
}
const eur = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100)
const day = (i: string | null) => (i ? new Date(i).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '-')

// Printable commercial invoice (use the browser's Print / Save as PDF). Not a fiscal e-invoice - see the notice.
export default function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { apiFetch<Data>(`/admin/billing/invoices/${id}`).then(setD).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')) }, [id])
  if (error) return <p className="p-6 text-red-700">{error}</p>
  if (!d) return <p className="p-6 text-slate-500">Loading…</p>
  const { invoice: i, business: b } = d
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-slate-800 print:p-0">
      {d.missingBusinessDetails.length > 0 && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-amber-800 print:hidden">Do not send yet: GCO&apos;s official details are incomplete (missing {d.missingBusinessDetails.join(', ')}). Fill them in lib/config/business.ts once the founder confirms them.</p>}
      <p className="mb-4 text-xs text-slate-500 print:hidden"><button onClick={() => window.print()} className="rounded bg-slate-900 px-3 py-1 text-white">Print / save as PDF</button> Commercial invoice. A fiscal e-invoice (SDI) must be issued through your accountant or e-invoicing provider.</p>
      <div className="flex justify-between">
        <div><h1 className="text-xl font-semibold">{i.status === 'DRAFT' ? 'DRAFT invoice' : `Invoice ${i.number}`}{i.status === 'VOID' && ' (VOID)'}</h1><p className="mt-1">Period: {day(i.periodStart)} – {day(new Date(new Date(i.periodEnd).getTime() - 1).toISOString())}</p><p>Issued: {day(i.issuedAt)} · Due: {day(i.dueAt)}</p></div>
        <div className="text-right"><p className="font-semibold">{b.legalName ?? b.tradingName}</p><p>{b.registeredAddress ?? '[registered address pending]'}</p><p>VAT: {b.vatNumber ?? '[pending]'} · Tax code: {b.taxCode ?? '[pending]'}</p><p>{b.invoiceEmail}</p></div>
      </div>
      <p className="mt-6"><span className="text-xs uppercase text-slate-500">Billed to</span><br /><b>{d.client}</b></p>
      <table className="mt-6 w-full text-left"><thead className="border-b text-xs uppercase text-slate-500"><tr><th className="py-1">Description</th><th>Qty</th><th>Unit price</th><th className="text-right">Amount</th></tr></thead><tbody>
        {i.lines.map((l, n) => <tr key={n} className="border-b border-slate-100"><td className="py-1.5">{l.description}</td><td>{l.quantity} {l.unit}</td><td>{l.unitPriceEurCents === null ? '-' : eur(l.unitPriceEurCents)}</td><td className="text-right">{eur(l.amountEurCents)}</td></tr>)}
      </tbody></table>
      <div className="mt-4 ml-auto w-64 space-y-1"><div className="flex justify-between"><span>Subtotal</span><span>{eur(i.subtotalEurCents)}</span></div><div className="flex justify-between"><span>VAT {i.vatRatePercent}%</span><span>{eur(i.vatEurCents)}</span></div><div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span><span>{eur(i.totalEurCents)}</span></div></div>
      {i.vatNote && <p className="mt-4 text-xs text-slate-600">{i.vatNote}</p>}
    </div>
  )
}
