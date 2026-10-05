'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { REASON_LABELS, STATUS_LABELS } from './labels'

interface Row {
  id: string
  status: string
  reason: string
  escalatedToClientAt: string | null
  events: { id: string; action: string; body: string | null; createdAt: string }[]
}

// Client-facing view: only escalations that need a client decision, and only the client-visible
// messages. Internal operator/supervisor notes are never sent to this role by the API.
export function ClientDecisions() {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    const load = () => apiFetch<Row[]>('/escalations').then(setRows).catch(() => {})
    load()
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [])
  if (rows.length === 0) return null
  return (
    <section aria-labelledby="decisions-title" className="mb-8 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-card">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
        <h2 id="decisions-title" className="text-sm font-semibold text-amber-900">Decisions needed from you</h2>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1 p-4 text-sm">
            <p className="font-medium text-slate-900">
              {REASON_LABELS[r.reason]} <span className="ml-2 text-xs font-normal text-slate-500">{STATUS_LABELS[r.status]}</span>
            </p>
            {r.events.map((e) => (
              <p key={e.id} className="text-slate-600">{e.body}</p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
