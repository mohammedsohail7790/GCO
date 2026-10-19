'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatCard } from '@/components/ui/StatCard'

const eur = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
const toCents = (v: string) => Math.round(parseFloat(v.replace(',', '.')) * 100)

interface Row { operatorId: string; operatorNumber: number; name: string; active: boolean; tenantId: string; tenantName: string; awaitingPayoutEurCents: number; pendingPaymentEurCents: number; paidEurCents: number; pendingMessages: number }
interface Payout { id: string; operatorId: string; status: 'PENDING' | 'PAID'; totalEurCents: number; lineCount: number; createdAt: string; paidAt: string | null; reference: string | null }
interface RateCard { id: string; tenantId: string | null; operatorId: string | null; amountEurCents: number; basis: string; effectiveFrom: string; note: string | null }
interface Detail {
  operator: { id: string; operatorNumber: number }
  messages: Record<string, number>
  earnings: { todayEurCents: number; weekEurCents: number; monthEurCents: number; totalAccumulatedEurCents: number; awaitingPayoutEurCents: number; pendingPaymentEurCents: number; paidEurCents: number }
  adjustments: { id: string; amountEurCents: number; reason: string; payoutId: string | null; createdAt: string }[]
  lines: { id: string; rateEurCents: number; state: string; stateReason: string | null; messageAt: string }[]
}

/** CEO (canManage) and manager (read-only) view of operator earnings. Every number comes from the ledger APIs. */
export function EarningsConsole({ canManage }: { canManage: boolean }) {
  const [tab, setTab] = useState<'operators' | 'payouts' | 'rates'>('operators')
  const [rows, setRows] = useState<Row[]>([])
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [rates, setRates] = useState<RateCard[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const flash = (kind: 'ok' | 'err', text: string) => setMsg({ kind, text })
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setMsg(null)
    try { const t = await fn(); if (t) flash('ok', t) } catch (e) { flash('err', e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const load = useCallback(
    () =>
      apiFetch<{ operators: Row[]; tenants: { id: string; name: string }[] }>('/admin/earnings/overview')
        .then(async (o) => {
          setRows(o.operators)
          setTenants(o.tenants)
          if (canManage) {
            const [p, r] = await Promise.all([apiFetch<Payout[]>('/admin/earnings/payouts'), apiFetch<RateCard[]>('/admin/earnings/rate-cards')])
            setPayouts(p)
            setRates(r)
          }
        })
        .catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load' })),
    [canManage],
  )
  useEffect(() => {
    load()
  }, [load])

  const open = (id: string) => run(async () => { setDetail(await apiFetch<Detail>(`/admin/earnings/operators/${id}`)) })
  const refreshDetail = async (id: string) => { setDetail(await apiFetch<Detail>(`/admin/earnings/operators/${id}`)); await load() }

  const totals = rows.reduce((a, r) => ({ owed: a.owed + r.awaitingPayoutEurCents, pending: a.pending + r.pendingPaymentEurCents, paid: a.paid + r.paidEurCents }), { owed: 0, pending: 0, paid: 0 })
  const opName = (id: string) => { const r = rows.find((x) => x.operatorId === id); return r ? `#${r.operatorNumber} ${r.name}` : id }

  // forms
  const [adj, setAdj] = useState({ amount: '', reason: '' })
  const [rate, setRate] = useState({ scope: 'all', targetId: '', amount: '', basis: 'DELIVERED', from: new Date().toISOString().slice(0, 10), note: '' })
  const [refs, setRefs] = useState<Record<string, string>>({})

  return (
    <div className="space-y-6">
      {msg && <p className={`rounded-lg px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Owed - ready to pay" value={eur(totals.owed)} accent={totals.owed > 0 ? 'warn' : undefined} />
        <StatCard label="Payments in progress" value={eur(totals.pending)} />
        <StatCard label="Paid to date" value={eur(totals.paid)} accent="good" />
      </section>

      <nav className="flex items-center gap-2 border-b border-slate-200">
        {(canManage ? (['operators', 'payouts', 'rates'] as const) : (['operators'] as const)).map((t) => (
          <button key={t} onClick={() => { setTab(t); setDetail(null) }} className={`px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-brand-500 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
            {t === 'operators' ? 'Operators' : t === 'payouts' ? 'Payments' : 'Rates'}
          </button>
        ))}
        {canManage && (
          <button disabled={busy} onClick={() => run(async () => { const r = await apiFetch<{ created: number; unrated: number; updated: number }>('/admin/earnings/sync', { method: 'POST', body: '{}' }); await load(); return `Ledger refreshed: ${r.created} new, ${r.updated} updated, ${r.unrated} without a rate.` })} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Refresh figures
          </button>
        )}
      </nav>

      {tab === 'operators' && !detail && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Operator</th><th>Client</th><th>Owed</th><th>In progress</th><th>Paid</th><th>Awaiting approval</th><th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">No operators.</td></tr>}
              {rows.map((r) => (
                <tr key={r.operatorId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">#{r.operatorNumber} {r.name}{!r.active && <span className="ml-2 text-xs text-slate-400">inactive</span>}</td>
                  <td>{r.tenantName}</td>
                  <td className="tabular-nums">{eur(r.awaitingPayoutEurCents)}</td>
                  <td className="tabular-nums">{eur(r.pendingPaymentEurCents)}</td>
                  <td className="tabular-nums">{eur(r.paidEurCents)}</td>
                  <td className="tabular-nums">{r.pendingMessages}</td>
                  <td className="pr-3 text-right"><button onClick={() => open(r.operatorId)} className="text-xs font-medium text-brand-600 hover:underline">Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'operators' && detail && (
        <section className="space-y-4">
          <button onClick={() => setDetail(null)} className="text-xs font-medium text-brand-600 hover:underline">← All operators</button>
          <h2 className="text-base font-semibold text-slate-900">{opName(detail.operator.id)}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Today" value={eur(detail.earnings.todayEurCents)} />
            <StatCard label="This week" value={eur(detail.earnings.weekEurCents)} />
            <StatCard label="This month" value={eur(detail.earnings.monthEurCents)} />
            <StatCard label="Total earned" value={eur(detail.earnings.totalAccumulatedEurCents)} />
            <StatCard label="Ready to pay" value={eur(detail.earnings.awaitingPayoutEurCents)} />
            <StatCard label="Payment in progress" value={eur(detail.earnings.pendingPaymentEurCents)} />
            <StatCard label="Paid" value={eur(detail.earnings.paidEurCents)} />
            <StatCard label="Rejected / not payable" value={detail.messages.notPayable ?? 0} accent={(detail.messages.notPayable ?? 0) > 0 ? 'warn' : undefined} />
          </div>
          <p className="text-xs text-slate-500">
            Written {detail.messages.written} · sent {detail.messages.sent} · delivered {detail.messages.delivered} · approved {detail.messages.approved} · rejected {detail.messages.rejected} · payable {detail.messages.payable} · waiting {detail.messages.pending} · no rate yet {detail.messages.unrated} (times in UTC)
          </p>

          {canManage && (
            <div className="grid gap-4 md:grid-cols-2">
              <form className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); run(async () => { await apiFetch('/admin/earnings/adjustments', { method: 'POST', body: JSON.stringify({ operatorId: detail.operator.id, amountEurCents: toCents(adj.amount), reason: adj.reason }) }); setAdj({ amount: '', reason: '' }); await refreshDetail(detail.operator.id); return 'Adjustment recorded.' }) }}>
                <h3 className="text-sm font-semibold text-slate-900">Add adjustment</h3>
                <p className="text-xs text-slate-500">Negative to deduct. The operator sees the reason. Adjustments cannot be edited or deleted - correct a mistake with another adjustment.</p>
                <input required value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} placeholder="Amount in EUR, e.g. -1.50" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <input required minLength={5} maxLength={500} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="Reason (visible to the operator)" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <button disabled={busy || !adj.amount || adj.reason.trim().length < 5} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Record adjustment</button>
              </form>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Create payment</h3>
                <p className="text-xs text-slate-500">Settles everything currently payable plus unsettled adjustments, up to now ({eur(detail.earnings.awaitingPayoutEurCents)}). It locks those entries; then mark it paid once the transfer is made.</p>
                <button disabled={busy || detail.earnings.awaitingPayoutEurCents <= 0} onClick={() => { if (!window.confirm(`Create a payment of ${eur(detail.earnings.awaitingPayoutEurCents)} for ${opName(detail.operator.id)}?`)) return; run(async () => { await apiFetch('/admin/earnings/payouts', { method: 'POST', body: JSON.stringify({ operatorId: detail.operator.id, periodEnd: new Date().toISOString() }) }); await refreshDetail(detail.operator.id); return 'Payment created. Mark it paid under Payments after the transfer.' }) }} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Create payment</button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Adjustments</h3>
            {detail.adjustments.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">{detail.adjustments.map((a) => <li key={a.id} className="flex justify-between gap-4 py-1.5"><span>{a.reason} <span className="text-xs text-slate-400">{when(a.createdAt)}{a.payoutId ? ' · settled' : ''}</span></span><span className={`tabular-nums ${a.amountEurCents < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{eur(a.amountEurCents)}</span></li>)}</ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">Recent messages</h3>
            <table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-400"><tr><th>Written</th><th>Rate</th><th>State</th></tr></thead><tbody>
              {detail.lines.map((l) => <tr key={l.id} className="border-t border-slate-100"><td className="py-1">{when(l.messageAt)}</td><td className="tabular-nums">{eur(l.rateEurCents)}</td><td>{l.state}{l.stateReason ? <span className="ml-2 text-xs text-slate-400">{l.stateReason}</span> : null}</td></tr>)}
            </tbody></table>
          </div>
        </section>
      )}

      {canManage && tab === 'payouts' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Created</th><th>Operator</th><th>Messages</th><th>Total</th><th>Status</th><th /></tr></thead>
            <tbody>
              {payouts.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">No payments yet.</td></tr>}
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{when(p.createdAt)}</td><td>{opName(p.operatorId)}</td><td>{p.lineCount}</td><td className="font-medium tabular-nums">{eur(p.totalEurCents)}</td>
                  <td>{p.status === 'PAID' ? `Paid ${p.paidAt ? when(p.paidAt) : ''}${p.reference ? ` · ${p.reference}` : ''}` : 'Pending'}</td>
                  <td className="pr-3 text-right">
                    {p.status === 'PENDING' && (
                      <span className="inline-flex items-center gap-2">
                        <input value={refs[p.id] ?? ''} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} placeholder="Transfer reference" maxLength={120} className="w-36 rounded border border-slate-300 px-2 py-1 text-xs" />
                        <button disabled={busy} onClick={() => run(async () => { await apiFetch(`/admin/earnings/payouts/${p.id}/paid`, { method: 'POST', body: JSON.stringify({ reference: refs[p.id] || null }) }); await load(); return 'Marked as paid.' })} className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Mark paid</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && tab === 'rates' && (
        <section className="space-y-4">
          <form className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); run(async () => {
            await apiFetch('/admin/earnings/rate-cards', { method: 'POST', body: JSON.stringify({ tenantId: rate.scope === 'tenant' ? rate.targetId : null, operatorId: rate.scope === 'operator' ? rate.targetId : null, amountEurCents: toCents(rate.amount), basis: rate.basis, effectiveFrom: new Date(rate.from).toISOString(), note: rate.note || null }) })
            setRate({ ...rate, amount: '', note: '' }); await load(); return 'Rate added. Earlier messages keep their old rate.' }) }}>
            <select value={rate.scope} onChange={(e) => setRate({ ...rate, scope: e.target.value, targetId: '' })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="all">All operators</option><option value="tenant">One client</option><option value="operator">One operator</option></select>
            {rate.scope === 'tenant' && <select required value={rate.targetId} onChange={(e) => setRate({ ...rate, targetId: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="">Client…</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
            {rate.scope === 'operator' && <select required value={rate.targetId} onChange={(e) => setRate({ ...rate, targetId: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="">Operator…</option>{rows.map((r) => <option key={r.operatorId} value={r.operatorId}>#{r.operatorNumber} {r.name}</option>)}</select>}
            <input required value={rate.amount} onChange={(e) => setRate({ ...rate, amount: e.target.value })} placeholder="EUR per message, e.g. 0.06" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <select value={rate.basis} onChange={(e) => setRate({ ...rate, basis: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="DELIVERED">Payable when delivered</option><option value="APPROVED">Payable when approved</option></select>
            <input type="date" required value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button disabled={busy || !rate.amount} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Add rate</button>
            <p className="text-xs text-slate-500 md:col-span-6">Rates are never edited. A new rate applies from its start date (UTC); the most specific rate wins: operator, then client, then all operators.</p>
          </form>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">From</th><th>Applies to</th><th>Rate</th><th>Payable when</th><th>Note</th></tr></thead>
              <tbody>
                {rates.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No rates yet - operators&apos; messages stay unpriced (not lost) until one applies.</td></tr>}
                {rates.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{new Date(r.effectiveFrom).toLocaleDateString('en-GB')}</td>
                    <td>{r.operatorId ? opName(r.operatorId) : r.tenantId ? tenants.find((t) => t.id === r.tenantId)?.name ?? r.tenantId : 'All operators'}</td>
                    <td className="tabular-nums">{eur(r.amountEurCents)}</td><td>{r.basis === 'APPROVED' ? 'Approved' : 'Delivered'}</td><td className="text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
