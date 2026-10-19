'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Metrics {
  messages: { written: number; delivered: number; failed: number; approved: number; rejected: number; unreviewed: number }
  quality: { reviews: number; avgAccuracy: number | null; avgTone: number | null; avgResolution: number | null; passRate: number | null }
  response: { conversationsHandled: number; slaMissed: number; avgResponseSeconds: number | null; slaMetPct: number | null }
  attendance: { scheduledHours: number; absences: number } | null
  earningsEurCents?: number
}
interface Report { id: string; operator: { id: string; number: number; name: string }; status: 'DRAFT' | 'REVIEWED'; metrics: Metrics; comparison: Record<string, number | null> | null; managerFeedback: string | null }

const eur = (c: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(c / 100)
const dash = (v: number | null | undefined, suffix = '') => (v === null || v === undefined ? '–' : `${v}${suffix}`)
const delta = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v > 0 ? ` (+${v})` : ` (${v})`)

function lastMonday() {
  const d = new Date()
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return new Date(day.getTime() - (((day.getUTCDay() + 6) % 7) + 7) * 86_400_000).toISOString().slice(0, 10)
}

/** Weekly operator reports for the operators this user supervises, with a review step that adds feedback and freezes the report. */
export function WeeklyReports({ tenantId }: { tenantId?: string }) {
  const [week, setWeek] = useState(lastMonday)
  const [reports, setReports] = useState<Report[] | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      apiFetch<{ reports: Report[] }>(`/reports/weekly?week=${week}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ''}`)
        .then((d) => { setReports(d.reports); setError(null) })
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reports')),
    [week, tenantId],
  )
  useEffect(() => { load() }, [load])

  const review = (r: Report) =>
    apiFetch(`/reports/weekly/${r.id}`, { method: 'PATCH', body: JSON.stringify({ feedback: feedback[r.id] ?? '' }) })
      .then(load)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to save review'))

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Weekly operator reports</h2>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">Week of (Monday, UTC)
          <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800" />
        </label>
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {reports === null && !error && <p className="p-4 text-sm text-slate-400">Loading…</p>}
      {reports?.length === 0 && <p className="p-4 text-sm text-slate-400">No operators in scope.</p>}
      <ul className="divide-y divide-slate-100">
        {reports?.map((r) => (
          <li key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-900">#{r.operator.number} {r.operator.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'REVIEWED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{r.status === 'REVIEWED' ? 'Reviewed' : 'Draft'}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
              <div>Written <b className="text-slate-900">{r.metrics.messages.written}</b>{delta(r.comparison?.written)}</div>
              <div>Delivered <b className="text-slate-900">{r.metrics.messages.delivered}</b>{delta(r.comparison?.delivered)}</div>
              <div>Approved / rejected <b className="text-slate-900">{r.metrics.messages.approved} / {r.metrics.messages.rejected}</b></div>
              <div>Failed <b className="text-slate-900">{r.metrics.messages.failed}</b></div>
              <div>Avg response <b className="text-slate-900">{dash(r.metrics.response.avgResponseSeconds, ' s')}</b>{delta(r.comparison?.avgResponseSeconds)}</div>
              <div>Deadline met <b className="text-slate-900">{dash(r.metrics.response.slaMetPct, '%')}</b></div>
              <div>Quality (accuracy) <b className="text-slate-900">{dash(r.metrics.quality.avgAccuracy)}</b> of 5 · {r.metrics.quality.reviews} reviews</div>
              <div>Scheduled <b className="text-slate-900">{r.metrics.attendance ? `${r.metrics.attendance.scheduledHours} h` : 'no shifts'}</b>{r.metrics.attendance?.absences ? ` · ${r.metrics.attendance.absences} absence(s)` : ''}</div>
              {r.metrics.earningsEurCents !== undefined && <div>Earnings <b className="text-slate-900">{eur(r.metrics.earningsEurCents)}</b>{delta(r.comparison?.earningsEurCents ? r.comparison.earningsEurCents / 100 : r.comparison?.earningsEurCents)}</div>}
            </dl>
            {r.status === 'REVIEWED' ? (
              r.managerFeedback && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{r.managerFeedback}</p>
            ) : (
              <div className="mt-2 flex items-start gap-2">
                <textarea value={feedback[r.id] ?? ''} onChange={(e) => setFeedback({ ...feedback, [r.id]: e.target.value })} maxLength={3000} rows={2} placeholder="Feedback for the operator (shown to them once reviewed)" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                <button onClick={() => review(r)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Review &amp; freeze</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
