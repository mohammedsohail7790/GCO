'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Client { tenantId: string; name: string; status: string; industry: string | null; billableMessages: number; billedEurCents: number; operatorOwedEurCents: number; marginEurCents: number; marginPercent: number | null; invoicedOutstandingEurCents: number; operators: number; activeConversations: number; slaMetPct: number | null; qaPassRate: number | null }
interface Overview {
  totals: { revenueEurCents: number; operatorCostEurCents: number; marginEurCents: number; marginPercent: number | null; billableMessages: number; outstandingInvoicesEurCents: number; clients: number; activeClients: number; operators: number }
  obligations: { operatorsAwaitingPayoutEurCents: number; payoutsInProgressEurCents: number }
  capacity: { operatorsOnline: number; openSlots: number; totalSlots: number; activeConversations: number; shiftsNext7Days: number }
  projection: { monthToDateRevenueEurCents: number; projectedMonthRevenueEurCents: number; basis: string }
  series: { day: string; messages: number; revenueEurCents: number }[]
  clients: Client[]
}

// whole euros for big figures, cents while amounts are small
const eur = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: Math.abs(c) >= 1_000_000 ? 0 : 2 }).format(c / 100)
const eur2 = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100)
const WIDGETS = [['kpis', 'Key figures'], ['trend', 'Daily activity chart'], ['clients', 'Profitability by client'], ['obligations', 'Payment obligations'], ['capacity', 'Capacity and projection']] as const
type WidgetKey = (typeof WIDGETS)[number][0]
const LS = 'gco-exec-widgets'
const PERIODS = { mtd: 'Month to date', d30: 'Last 30 days', last: 'Last month', q: 'Last 90 days' } as const

function range(p: keyof typeof PERIODS) {
  const n = new Date()
  const som = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1))
  if (p === 'mtd') return { from: som, to: new Date(n.getTime() + 1) }
  if (p === 'last') return { from: new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() - 1, 1)), to: som }
  return { from: new Date(n.getTime() - (p === 'd30' ? 30 : 90) * 86_400_000), to: new Date(n.getTime() + 1) }
}

function Bars({ data, label, fmt }: { data: { x: string; y: number }[]; label: string; fmt: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.y), 1)
  const w = 100 / Math.max(data.length, 1)
  return (
    <figure aria-label={label}>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-28 w-full text-brand-500" role="img">
        {data.map((d, i) => <rect key={d.x} x={i * w + w * 0.12} width={w * 0.76} y={32 - (d.y / max) * 30} height={(d.y / max) * 30} rx="0.6" fill="currentColor" opacity="0.85"><title>{`${d.x}: ${fmt(d.y)}`}</title></rect>)}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-slate-400"><span>{data[0]?.x ?? ''}</span><span>peak {fmt(max)}</span><span>{data[data.length - 1]?.x ?? ''}</span></figcaption>
    </figure>
  )
}

export function ExecutiveOverview() {
  const [period, setPeriod] = useState<keyof typeof PERIODS>('mtd')
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState<WidgetKey[]>(() => WIDGETS.map((w) => w[0]))
  const [customize, setCustomize] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ type: string; label: string; href: string }[]>([])
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(LS) ?? 'null'); // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Array.isArray(s)) setVisible(s.filter((k): k is WidgetKey => WIDGETS.some((w) => w[0] === k))) } catch { /* default layout */ } }, [])
  const load = useCallback(() => { const r = range(period); return apiFetch<Overview>(`/admin/executive/overview?from=${r.from.toISOString()}&to=${r.to.toISOString()}`).then((d) => { setData(d); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')) }, [period])
  useEffect(() => { load(); const id = setInterval(load, 20_000); return () => clearInterval(id) }, [load])
  const toggle = (k: WidgetKey) => setVisible((v) => { const n = v.includes(k) ? v.filter((x) => x !== k) : [...v, k]; localStorage.setItem(LS, JSON.stringify(n)); return n })
  const search = (v: string) => { setQ(v); if (searchRef.current) clearTimeout(searchRef.current); searchRef.current = setTimeout(() => { if (v.trim().length < 2) setHits([]); else apiFetch<typeof hits>(`/admin/executive/search?q=${encodeURIComponent(v)}`).then(setHits).catch(() => setHits([])) }, 250) }
  const show = (k: WidgetKey) => visible.includes(k)
  const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-card'

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-semibold text-slate-900">Company overview</h2>
        <select value={period} onChange={(e) => setPeriod(e.target.value as keyof typeof PERIODS)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">{Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <div className="relative ml-auto w-full sm:w-72">
          <input value={q} onChange={(e) => search(e.target.value)} placeholder="Search clients, people, invoices, leads…" aria-label="Search" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
          {hits.length > 0 && <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-panel">{hits.map((h, i) => <li key={i}><a href={h.href} className="flex justify-between gap-3 px-3 py-1.5 hover:bg-slate-50"><span className="truncate">{h.label}</span><span className="shrink-0 text-xs text-slate-400">{h.type}</span></a></li>)}</ul>}
        </div>
        <button onClick={() => setCustomize((c) => !c)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600">Customize</button>
      </div>
      {customize && <div className={`${card} mb-3 flex flex-wrap gap-4 text-sm`}>{WIDGETS.map(([k, l]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={show(k)} onChange={() => toggle(k)} />{l}</label>)}<span className="text-xs text-slate-400">Saved on this device.</span></div>}
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {data && (
        <div className="space-y-4">
          {show('kpis') && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {([['Revenue', eur(data.totals.revenueEurCents), `${data.totals.billableMessages.toLocaleString('en-GB')} billable messages`], ['Operator cost', eur(data.totals.operatorCostEurCents), 'payable earnings + adjustments'], ['Gross margin', eur(data.totals.marginEurCents), data.totals.marginPercent === null ? '–' : `${data.totals.marginPercent}%`], ['Unpaid invoices', eur(data.totals.outstandingInvoicesEurCents), 'issued, not yet paid'], ['Clients / operators', `${data.totals.activeClients} / ${data.totals.operators}`, `${data.totals.clients} clients in total`]] as const).map(([l, v, s]) => <div key={l} className={card}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</p><p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{v}</p><p className="text-xs text-slate-400">{s}</p></div>)}
            </div>
          )}
          {show('trend') && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className={card}><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Billable messages per day (last 30 days)</h3><Bars label="Billable messages per day" data={data.series.map((s) => ({ x: s.day, y: s.messages }))} fmt={(n) => String(n)} /></div>
              <div className={card}><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Revenue per day (last 30 days)</h3><Bars label="Revenue per day" data={data.series.map((s) => ({ x: s.day, y: s.revenueEurCents }))} fmt={eur2} /></div>
            </div>
          )}
          {show('clients') && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold text-slate-900">Profitability by client</h3></div>
              <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Client</th><th>Revenue</th><th>Operator cost</th><th>Margin</th><th>Unpaid</th><th>Ops</th><th>Live</th><th>On time</th><th>QA pass</th><th /></tr></thead><tbody>
                {data.clients.length === 0 && <tr><td colSpan={10} className="px-4 py-6 text-center text-slate-400">No clients yet.</td></tr>}
                {data.clients.map((c) => <tr key={c.tenantId} className="border-t border-slate-100"><td className="px-4 py-2 font-medium text-slate-900">{c.name}{c.status !== 'ACTIVE' && <span className="ml-2 text-xs text-amber-600">{c.status.toLowerCase()}</span>}</td><td className="tabular-nums">{eur(c.billedEurCents)}</td><td className="tabular-nums">{eur(c.operatorOwedEurCents)}</td><td className={`tabular-nums ${c.marginEurCents < 0 ? 'font-semibold text-red-600' : ''}`}>{eur(c.marginEurCents)}{c.marginPercent !== null && <span className="ml-1 text-xs text-slate-400">{c.marginPercent}%</span>}</td><td className="tabular-nums">{eur(c.invoicedOutstandingEurCents)}</td><td>{c.operators}</td><td>{c.activeConversations}</td><td>{c.slaMetPct === null ? '–' : `${c.slaMetPct}%`}</td><td>{c.qaPassRate === null ? '–' : `${c.qaPassRate}%`}</td><td className="space-x-2 pr-4 text-right text-xs"><a className="font-medium text-brand-600 hover:underline" href={`/admin/billing?tenantId=${c.tenantId}`}>Billing</a><a className="font-medium text-brand-600 hover:underline" href={`/admin/privacy?tenantId=${c.tenantId}`}>Privacy</a></td></tr>)}
              </tbody></table>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {show('obligations') && <div className={card}><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Payment obligations to operators</h3><p className="text-sm text-slate-600">Ready to pay <b className="text-slate-900">{eur(data.obligations.operatorsAwaitingPayoutEurCents)}</b></p><p className="text-sm text-slate-600">Payments in progress <b className="text-slate-900">{eur(data.obligations.payoutsInProgressEurCents)}</b></p><a href="/admin/earnings" className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">Open earnings and payments</a></div>}
            {show('capacity') && <div className={card}><h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Capacity and projection</h3><p className="text-sm text-slate-600">Operators online <b className="text-slate-900">{data.capacity.operatorsOnline}</b> · open chat slots <b className="text-slate-900">{data.capacity.openSlots}</b> of {data.capacity.totalSlots} · live conversations <b className="text-slate-900">{data.capacity.activeConversations}</b></p><p className="text-sm text-slate-600">Shifts planned, next 7 days <b className="text-slate-900">{data.capacity.shiftsNext7Days}</b></p><p className="mt-1 text-sm text-slate-600">Projected revenue this month <b className="text-slate-900">{eur(data.projection.projectedMonthRevenueEurCents)}</b> <span className="text-xs text-slate-400">(so far {eur(data.projection.monthToDateRevenueEurCents)}; {data.projection.basis.toLowerCase()})</span></p></div>}
          </div>
        </div>
      )}
    </section>
  )
}
