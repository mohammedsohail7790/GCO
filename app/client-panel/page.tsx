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
    <div className="min-h-screen p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Client dashboard</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Messages (30d)</p>
          <p className="mt-1 text-2xl font-semibold">{usage?.messageCount ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Spend (30d)</p>
          <p className="mt-1 text-2xl font-semibold">€{usage?.totalPriceEur?.toFixed(2) ?? '—'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-900">Submit feedback / request</h2>
          <form onSubmit={submitTicket} className="space-y-3">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              required
              placeholder="Description"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {submitError && <p className="text-sm text-red-700">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 font-semibold text-slate-900">My tickets</h2>
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-md border border-slate-100 p-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{t.subject}</span>
                  <span className="text-xs text-slate-500">{t.status}</span>
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
