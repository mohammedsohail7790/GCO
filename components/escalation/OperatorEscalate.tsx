'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { LEVEL_LABELS, REASON_LABELS, STATUS_LABELS } from './labels'

export interface ActiveEscalation {
  id: string
  level: string
  status: string
  reason: string
  createdAt: string
}

// Operator-side escalation: a clear "Escalate" action with a required reason + note, and a
// visible status once raised. The operator never sees supervisor notes (server-shaped view).
export function OperatorEscalate({ conversationId, active, onDone }: { conversationId: string; active: ActiveEscalation | null; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('DECISION_NEEDED')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (active) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
        title={REASON_LABELS[active.reason]}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
        Escalated · {STATUS_LABELS[active.status] ?? active.status} · {LEVEL_LABELS[active.level] ?? active.level}
      </span>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/escalations', { method: 'POST', body: JSON.stringify({ conversationId, reason, note }) })
      setOpen(false)
      setNote('')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not escalate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
      >
        Escalate
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="escalate-title">
          <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-5 shadow-xl">
            <h2 id="escalate-title" className="text-base font-semibold text-slate-900">
              Escalate to supervisor
            </h2>
            <p className="text-xs text-slate-500">Use this when you need a decision, client approval, or cannot safely resolve the conversation yourself.</p>
            <div>
              <label htmlFor="esc-reason" className="block text-sm font-medium text-slate-700">
                Reason
              </label>
              <select id="esc-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {Object.entries(REASON_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="esc-note" className="block text-sm font-medium text-slate-700">
                What is the situation?
              </label>
              <textarea
                id="esc-note"
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button type="submit" disabled={busy || note.trim().length < 5} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                {busy ? 'Escalating…' : 'Escalate'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
