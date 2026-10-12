'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { languageLabel } from '@/lib/languages'

interface Report {
  days: number
  conversationsPerDay: { date: string; count: number }[]
  totals: { conversationsStarted: number; conversationsResolved: number; messagesReceived: number; repliesSent: number; escalations: number }
  responseTime: { averageSeconds: number | null; samples: number }
  slaCompliance: { percent: number | null; answered: number }
  quality: { reviews: number; accuracy: number | null; tone: number | null; resolution: number | null; passRate: number | null }
  languages: { language: string | null; conversations: number }[]
}
const fmtSec = (s: number | null) => (s === null ? '—' : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`)

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  
  )
}

// Client-safe summary of how the service performed (counts, timings, average quality scores). No operator names or notes.
export function ReportsPanel() {
  const [r, setR] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { apiFetch<Report>('/reports/client?days=14').then(setR).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load report')) }, [])
  if (error) return <p role="alert" className="mb-6 text-sm text-red-600">{error}</p>
  if (!r) return null
  const max = Math.max(1, ...r.conversationsPerDay.map((d) => d.count))
  return (
    <section className="mb-8" aria-labelledby="rep-title">
      <h2 id="rep-title" className="mb-3 text-sm font-semibold text-slate-900">Service report — last {r.days} days</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Card label="Conversations" value={String(r.totals.conversationsStarted)} hint={`${r.totals.conversationsResolved} resolved`} />
        <Card label="Customer messages" value={String(r.totals.messagesReceived)} />
        <Card label="Replies sent" value={String(r.totals.repliesSent)} />
        <Card label="Avg first response" value={fmtSec(r.responseTime.averageSeconds)} hint={`${r.responseTime.samples} answered`} />
        <Card label="Within deadline" value={r.slaCompliance.percent === null ? '—' : `${r.slaCompliance.percent}%`} hint={`${r.slaCompliance.answered} conversations`} />
        <Card label="Quality score" value={r.quality.reviews ? `${(((r.quality.accuracy ?? 0) + (r.quality.tone ?? 0) + (r.quality.resolution ?? 0)) / 3).toFixed(1)} / 5` : '—'} hint={r.quality.reviews ? `${r.quality.reviews} reviews` : 'no reviews yet'} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">New conversations per day</h3>
          <ul className="space-y-1">
            {r.conversationsPerDay.map((d) => (
              <li key={d.date} className="flex items-center gap-2 text-xs"><span className="w-20 text-slate-500">{d.date.slice(5)}</span><span className="h-2 rounded bg-brand-500" style={{ width: `${(d.count / max) * 70}%`, minWidth: d.count ? 4 : 0 }} /><span className="tabular-nums text-slate-700">{d.count}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By language</h3>
          <ul className="space-y-1 text-sm">
            {r.languages.map((l) => <li key={l.language ?? 'none'} className="flex justify-between"><span>{languageLabel(l.language)}</span><span className="tabular-nums text-slate-600">{l.conversations}</span></li>)}
            {r.languages.length === 0 && <li className="text-slate-400">No conversations in this period.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
