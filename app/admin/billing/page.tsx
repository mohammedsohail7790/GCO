'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Tenant { id: string; name: string }
interface Settings { billingModel: string; pricePerMessageEurCents: number; operatorCostPerMessageEurCents: number; pricePerTicketEurCents: number | null; pricePerHourEurCents: number | null; monthlyFeeEurCents: number | null; vatRatePercent: number; vatNote: string | null; paymentTermsDays: number }
interface Invoice { id: string; number: string | null; tenantId: string; status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID'; periodStart: string; periodEnd: string; totalEurCents: number; billingModel: string; dueAt: string | null }
interface Recon { activity: { billableMessages: number; deliveredOperatorMessages: number }; clientBilling: { billedPerUsageEurCents: number; invoicedSubtotalEurCents: number }; operatorCompensation: { ledgerCostEurCents: number; owedEurCents: number; payableMessages: number; pendingMessages: number; rejectedMessages: number }; margin: { grossEurCents: number; grossPercent: number | null }; mismatches: { deliveredWithoutUsageRecord: number; deliveredWithoutEarningLine: number; usageVsInvoiceDifferenceEurCents: number | null } }

const eur = (c: number | null) => (c === null ? '–' : new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100))
const toCents = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100))
const monthStart = (offset: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1)).toISOString().slice(0, 10) }

export default function BillingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [s, setS] = useState<Settings | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [recon, setRecon] = useState<Recon | null>(null)
  const [period, setPeriod] = useState({ from: monthStart(-1), to: monthStart(0) })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({ model: 'PER_MESSAGE', msg: '', cost: '', ticket: '', hour: '', monthly: '', vat: '22', vatNote: '', terms: '30' })

  useEffect(() => { apiFetch<Tenant[]>('/admin/tenants').then((t) => { setTenants(t); const want = new URLSearchParams(window.location.search).get('tenantId'); const pick = t.find((x) => x.id === want) ?? t[0]; if (pick) setTenantId(pick.id) }).catch(() => {}) }, [])
  const load = useCallback(() => {
    if (!tenantId) return Promise.resolve()
    return Promise.all([apiFetch<Settings>(`/admin/billing/settings?tenantId=${tenantId}`), apiFetch<Invoice[]>(`/admin/billing/invoices?tenantId=${tenantId}`)])
      .then(([st, inv]) => {
        setS(st); setInvoices(inv)
        setForm({ model: st.billingModel, msg: String(st.pricePerMessageEurCents / 100), cost: String(st.operatorCostPerMessageEurCents / 100), ticket: st.pricePerTicketEurCents === null ? '' : String(st.pricePerTicketEurCents / 100), hour: st.pricePerHourEurCents === null ? '' : String(st.pricePerHourEurCents / 100), monthly: st.monthlyFeeEurCents === null ? '' : String(st.monthlyFeeEurCents / 100), vat: String(st.vatRatePercent), vatNote: st.vatNote ?? '', terms: String(st.paymentTermsDays) })
      })
      .catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load' }))
  }, [tenantId])
  useEffect(() => { load() }, [load])
  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ kind: 'ok', text: ok }); return load() }).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Billing, invoices and reconciliation</h1>
        <a href="/admin" className="ml-auto text-sm font-medium text-brand-600 hover:underline">Back to dashboard</a>
      </div>
      {msg && <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mb-4 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>

      {s && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Pricing for this client</h2>
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); act(() => apiFetch('/admin/billing/settings', { method: 'PUT', body: JSON.stringify({ tenantId, billingModel: form.model, pricePerMessageEurCents: toCents(form.msg) ?? 0, operatorCostPerMessageEurCents: toCents(form.cost) ?? 0, pricePerTicketEurCents: toCents(form.ticket), pricePerHourEurCents: toCents(form.hour), monthlyFeeEurCents: toCents(form.monthly), vatRatePercent: Number(form.vat), vatNote: form.vatNote || null, paymentTermsDays: Number(form.terms) }) }), 'Pricing saved.') }}>
            <label className="text-xs text-slate-500">Model<select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"><option value="PER_MESSAGE">Per message</option><option value="PER_TICKET">Per resolved ticket</option><option value="PER_HOUR">Per scheduled hour</option><option value="MONTHLY_FLAT">Monthly fee</option></select></label>
            {([['msg', 'Per message (EUR)'], ['cost', 'Operator cost per message (EUR)'], ['ticket', 'Per ticket (EUR)'], ['hour', 'Per hour (EUR)'], ['monthly', 'Monthly fee (EUR)'], ['vat', 'VAT %'], ['terms', 'Payment terms (days)']] as const).map(([k, label]) => <label key={k} className="text-xs text-slate-500">{label}<input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>)}
            <label className="text-xs text-slate-500 sm:col-span-2">VAT note (e.g. reverse charge wording)<input value={form.vatNote} onChange={(e) => setForm({ ...form, vatNote: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
            <button className="self-end rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Save pricing</button>
          </form>
          <p className="mt-2 text-xs text-slate-500">Message prices are snapshotted when each message is processed - changing the price only affects future messages.</p>
        </section>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Period</h2>
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label className="text-xs text-slate-500">From<input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
          <label className="text-xs text-slate-500">To (exclusive)<input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
          <button onClick={() => act(() => apiFetch('/admin/billing/invoices', { method: 'POST', body: JSON.stringify({ tenantId, periodStart: `${period.from}T00:00:00Z`, periodEnd: `${period.to}T00:00:00Z` }) }), 'Draft invoice created.')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Create draft invoice</button>
          <button onClick={() => apiFetch<Recon>(`/admin/billing/reconciliation?tenantId=${tenantId}&from=${period.from}T00:00:00Z&to=${period.to}T00:00:00Z`).then(setRecon).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Reconcile period</button>
        </div>
        {recon && (
          <div className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p>Billable messages <b>{recon.activity.billableMessages}</b> · delivered operator messages <b>{recon.activity.deliveredOperatorMessages}</b></p>
            <p>Billed (usage ledger) <b>{eur(recon.clientBilling.billedPerUsageEurCents)}</b> · invoiced <b>{eur(recon.clientBilling.invoicedSubtotalEurCents)}</b></p>
            <p>Operators owed <b>{eur(recon.operatorCompensation.owedEurCents)}</b> ({recon.operatorCompensation.payableMessages} payable, {recon.operatorCompensation.pendingMessages} pending, {recon.operatorCompensation.rejectedMessages} rejected)</p>
            <p>Gross margin <b>{eur(recon.margin.grossEurCents)}</b>{recon.margin.grossPercent !== null && ` (${recon.margin.grossPercent}%)`}</p>
            <p className={recon.mismatches.deliveredWithoutUsageRecord ? 'font-semibold text-red-700' : 'text-slate-500'}>Delivered but never billed: {recon.mismatches.deliveredWithoutUsageRecord}</p>
            <p className={recon.mismatches.deliveredWithoutEarningLine ? 'font-semibold text-amber-700' : 'text-slate-500'}>Operator messages with no earning line: {recon.mismatches.deliveredWithoutEarningLine}</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Invoices</h2></div>
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Number</th><th>Period</th><th>Model</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>
          {invoices.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No invoices yet.</td></tr>}
          {invoices.map((i) => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">{i.number ?? 'draft'}</td><td>{new Date(i.periodStart).toLocaleDateString('en-GB')} – {new Date(new Date(i.periodEnd).getTime() - 1).toLocaleDateString('en-GB')}</td><td>{i.billingModel.toLowerCase().replace('_', ' ')}</td><td className="tabular-nums">{eur(i.totalEurCents)}</td><td>{i.status}</td>
              <td className="space-x-2 pr-4 text-right text-xs"><a href={`/admin/billing/invoice/${i.id}`} target="_blank" className="font-medium text-brand-600 hover:underline">View</a>
                {i.status === 'DRAFT' && <button onClick={() => act(() => apiFetch(`/admin/billing/invoices/${i.id}/issue`, { method: 'POST', body: '{}' }), 'Invoice issued.')} className="font-medium text-emerald-700 hover:underline">Issue</button>}
                {i.status === 'ISSUED' && <button onClick={() => act(() => apiFetch(`/admin/billing/invoices/${i.id}/pay`, { method: 'POST', body: JSON.stringify({ reference: window.prompt('Payment reference (optional)') || null }) }), 'Marked paid.')} className="font-medium text-emerald-700 hover:underline">Mark paid</button>}
                {(i.status === 'DRAFT' || i.status === 'ISSUED') && <button onClick={() => { const reason = window.prompt('Reason for voiding'); if (reason) act(() => apiFetch(`/admin/billing/invoices/${i.id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Voided.') }} className="font-medium text-red-600 hover:underline">Void</button>}</td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </div>
  )
}
