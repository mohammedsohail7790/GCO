'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Inv { id: string; number: string | null; status: 'ISSUED' | 'PAID'; periodStart: string; periodEnd: string; subtotalEurCents: number; vatRatePercent: number; vatEurCents: number; totalEurCents: number; dueAt: string | null; paidAt: string | null }
const eur = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100)
const d = (i: string | null) => (i ? new Date(i).toLocaleDateString('en-GB') : '-')

/** The client's own issued and paid invoices. */
export function InvoicesPanel() {
  const [rows, setRows] = useState<Inv[] | null>(null)
  useEffect(() => { apiFetch<Inv[]>('/client/invoices').then(setRows).catch(() => setRows([])) }, [])
  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Invoices</h2></div>
      {rows && rows.length === 0 ? <p className="p-4 text-sm text-slate-400">No invoices yet.</p> : (
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Number</th><th>Period</th><th>Net</th><th>VAT</th><th>Total</th><th>Due</th><th>Status</th></tr></thead><tbody>
          {rows?.map((i) => <tr key={i.id} className="border-t border-slate-100"><td className="px-4 py-2 font-medium">{i.number}</td><td>{d(i.periodStart)} – {d(new Date(new Date(i.periodEnd).getTime() - 1).toISOString())}</td><td className="tabular-nums">{eur(i.subtotalEurCents)}</td><td className="tabular-nums">{eur(i.vatEurCents)} ({i.vatRatePercent}%)</td><td className="font-medium tabular-nums">{eur(i.totalEurCents)}</td><td>{d(i.dueAt)}</td><td>{i.status === 'PAID' ? `Paid ${d(i.paidAt)}` : 'Open'}</td></tr>)}
        </tbody></table>
      )}
    </section>
  )
}
