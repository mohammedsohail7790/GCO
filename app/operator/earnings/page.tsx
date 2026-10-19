'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Earnings {
  messages: { written: number; sent: number; delivered: number; failed: number; approved: number; rejected: number; payable: number; pending: number; notPayable: number; unrated: number }
  earnings: {
    todayEurCents: number
    weekEurCents: number
    monthEurCents: number
    totalAccumulatedEurCents: number
    awaitingPayoutEurCents: number
    pendingPaymentEurCents: number
    paidEurCents: number
    awaitingApprovalMessages: number
  }
  adjustments: { id: string; amountEurCents: number; reason: string; payoutId: string | null; createdAt: string }[]
  payouts: { id: string; status: 'PENDING' | 'PAID'; totalEurCents: number; linesEurCents: number; adjustmentsEurCents: number; lineCount: number; periodEnd: string; createdAt: string; paidAt: string | null; reference: string | null }[]
  lines: { id: string; messageId: string; rateEurCents: number; state: 'PENDING' | 'PAYABLE' | 'REJECTED'; stateReason: string | null; messageAt: string; payoutId: string | null }[]
  period: { timezone: string }
}

const eur = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

const stateStyle: Record<string, string> = {
  PAYABLE: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
}

export default function OperatorEarningsPage() {
  const [data, setData] = useState<Earnings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Earnings>('/operators/me/earnings').then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load earnings'))
  }, [])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
          <span className="text-sm font-semibold text-slate-900">My earnings</span>
        </div>
        <a href="/operator" className="text-xs font-medium text-brand-600 hover:underline">Back to conversations</a>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        {!data && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {data && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Today" value={eur(data.earnings.todayEurCents)} hint={`Day, week and month are UTC`} />
              <Stat label="This week" value={eur(data.earnings.weekEurCents)} />
              <Stat label="This month" value={eur(data.earnings.monthEurCents)} />
              <Stat label="Total earned" value={eur(data.earnings.totalAccumulatedEurCents)} />
              <Stat label="Awaiting payout" value={eur(data.earnings.awaitingPayoutEurCents)} hint="Payable, not yet in a payment" />
              <Stat label="Payment in progress" value={eur(data.earnings.pendingPaymentEurCents)} />
              <Stat label="Paid" value={eur(data.earnings.paidEurCents)} />
              <Stat label="Waiting for approval" value={String(data.earnings.awaitingApprovalMessages)} hint="Messages not payable yet" />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Your messages</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                {([
                  ['Written', data.messages.written],
                  ['Sent', data.messages.sent],
                  ['Delivered', data.messages.delivered],
                  ['Failed', data.messages.failed],
                  ['Approved', data.messages.approved],
                  ['Rejected', data.messages.rejected],
                  ['Payable', data.messages.payable],
                  ['Not payable', data.messages.notPayable],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-slate-100 py-1"><dt className="text-slate-500">{k}</dt><dd className="font-medium tabular-nums text-slate-900">{v}</dd></div>
                ))}
              </dl>
              {data.messages.unrated > 0 && (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {data.messages.unrated} message(s) have no rate set yet. They are not lost — they will be priced once a rate applies.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Payments</h2>
              {data.payouts.length === 0 ? <p className="text-sm text-slate-400">No payments yet.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400"><tr><th className="py-1">Created</th><th>Messages</th><th>Adjustments</th><th>Total</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.payouts.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="py-1.5">{when(p.createdAt)}</td>
                        <td>{eur(p.linesEurCents)} <span className="text-xs text-slate-400">({p.lineCount})</span></td>
                        <td>{eur(p.adjustmentsEurCents)}</td>
                        <td className="font-medium">{eur(p.totalEurCents)}</td>
                        <td>{p.status === 'PAID' ? `Paid ${p.paidAt ? when(p.paidAt) : ''}${p.reference ? ` · ${p.reference}` : ''}` : 'Pending'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Adjustments</h2>
              {data.adjustments.length === 0 ? <p className="text-sm text-slate-400">No adjustments.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.adjustments.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 py-2">
                      <span><span className="text-slate-900">{a.reason}</span> <span className="text-xs text-slate-400">{when(a.createdAt)}</span></span>
                      <span className={`font-medium tabular-nums ${a.amountEurCents < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{eur(a.amountEurCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent messages</h2>
              {data.lines.length === 0 ? <p className="text-sm text-slate-400">Nothing yet.</p> : (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-400"><tr><th className="py-1">Written</th><th>Rate</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.lines.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100">
                        <td className="py-1.5">{when(l.messageAt)}</td>
                        <td className="tabular-nums">{eur(l.rateEurCents)}</td>
                        <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateStyle[l.state]}`}>{l.state === 'REJECTED' ? 'Not payable' : l.state === 'PAYABLE' ? 'Payable' : 'Pending'}</span>{l.stateReason && <span className="ml-2 text-xs text-slate-400">{l.stateReason}</span>}{l.payoutId && <span className="ml-2 text-xs text-slate-400">in payment</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
