'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Usage {
  messageCount: number
  totalPriceEur: number
  from: string
  to: string
}

interface Ticket {
  id: string
  subject: string
  status: string
  priority: string
  type: string
  createdAt: string
}

export default function ClientPanelPage() {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [form, setForm] = useState({ type: 'FEEDBACK', subject: '', description: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function load() {
    apiFetch<Usage>('/usage/summary')
      .then((d) => {
        setUsage(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard data'))
    apiFetch<Ticket[]>('/tickets').then(setTickets).catch(() => {})
  }

  useEffect(load, [])

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await apiFetch('/tickets', { method: 'POST', body: JSON.stringify(form) })
      setForm({ type: 'FEEDBACK', subject: '', description: '' })
      load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
          <span className="text-xs font-bold text-white">G</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Client dashboard</h1>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Messages (30d)</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{usage?.messageCount ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Spend (30d)</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">
            €{usage?.totalPriceEur?.toFixed(2) ?? '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Submit feedback / request</h2>
          <form onSubmit={submitTicket} className="space-y-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="FEEDBACK">Feedback</option>
              <option value="REQUEST">Request</option>
              <option value="COMPLAINT">Complaint</option>
              <option value="OPERATIONAL_ISSUE">Operational issue</option>
            </select>
            <input
              required
              placeholder="Subject"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <textarea
              required
              placeholder="Description"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {submitError && <p className="text-sm text-red-700">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">My tickets</h2>
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{t.subject}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{t.status}</span>
                </div>
              </li>
            ))}
            {tickets.length === 0 && <p className="text-sm text-slate-400">No tickets yet.</p>}
          </ul>
        </div>
      </div>
    </div>
  )
}
