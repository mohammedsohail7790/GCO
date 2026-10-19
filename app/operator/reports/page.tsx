'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Metrics {
  messages: { written: number; delivered: number; failed: number; approved: number; rejected: number }
  quality: { reviews: number; avgAccuracy: number | null; avgTone: number | null; avgResolution: number | null }
  response: { avgResponseSeconds: number | null; slaMetPct: number | null }
  attendance: { scheduledHours: number; absences: number } | null
  earningsEurCents?: number
}
interface Rep { id: string; weekStart: string; status: string; metrics: Metrics; managerFeedback: string | null }
const eur = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100)
const dash = (v: number | null, s = '') => (v === null ? '–' : `${v}${s}`)

function Card({ r, title }: { r: Rep; title: string }) {
  const m = r.metrics
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-3">
        <div>Written <b className="text-slate-900">{m.messages.written}</b></div>
        <div>Delivered <b className="text-slate-900">{m.messages.delivered}</b></div>
        <div>Approved / rejected <b className="text-slate-900">{m.messages.approved} / {m.messages.rejected}</b></div>
        <div>Avg response <b className="text-slate-900">{dash(m.response.avgResponseSeconds, ' s')}</b></div>
        <div>Deadline met <b className="text-slate-900">{dash(m.response.slaMetPct, '%')}</b></div>
        <div>Quality <b className="text-slate-900">{dash(m.quality.avgAccuracy)}</b> / 5 ({m.quality.reviews} reviews)</div>
        <div>Scheduled <b className="text-slate-900">{m.attendance ? `${m.attendance.scheduledHours} h` : '–'}</b></div>
        {m.earningsEurCents !== undefined && <div>Earned <b className="text-slate-900">{eur(m.earningsEurCents)}</b></div>}
      </dl>
      {r.managerFeedback && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="text-xs font-semibold uppercase text-slate-500">Manager feedback</span><br />{r.managerFeedback}</p>}
    </section>
  )
}

export default function OperatorReportsPage() {
  const [data, setData] = useState<{ current: Rep; history: Rep[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { apiFetch<{ current: Rep; history: Rep[] }>('/operators/me/reports').then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')) }, [])
  const wk = (r: Rep) => `Week of ${new Date(r.weekStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-900">My weekly reports</span>
        <a href="/operator" className="text-xs font-medium text-brand-600 hover:underline">Back to conversations</a>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        {data && <Card r={data.current} title={`${wk(data.current)} (so far)`} />}
        {data?.history.map((r) => <Card key={r.id} r={r} title={wk(r)} />)}
        {data && data.history.length === 0 && <p className="text-sm text-slate-400">Reviewed weekly reports will appear here.</p>}
      </main>
    </div>
  )
}
