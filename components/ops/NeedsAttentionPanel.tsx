'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Row {
  conversationId: string
  tenant: { id: string; name: string }
  customerRef: string
  reason: string
  consecutiveExpiries: number
  cap: number
  lastCustomerMessageAt: string | null
  lastAssignedTo: string | null
  lastExpiredAt: string | null
  slaSeconds: number | null
}

function ago(iso: string | null) {
  if (!iso) return 'unknown'
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min ago`
  if (mins < 2880) return `${Math.round(mins / 60)} h ago`
  return `${Math.round(mins / 1440)} days ago`
}

/** Conversations whose automatic SLA reassignment was capped. Shows operational metadata only - never message content. */
export function NeedsAttentionPanel() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Row[]>('/conversations/needs-attention').then(setRows).catch(() => setRows([]))
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  async function resume(id: string) {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/conversations/${id}/resume`, { method: 'POST', body: JSON.stringify({ reason: 'resumed by manager' }) })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume the conversation')
    } finally {
      setBusy(null)
    }
  }

  if (rows === null || rows.length === 0) return null
  return (
    <section className="mb-8 rounded-xl border border-amber-200 bg-amber-50/60" aria-labelledby="needs-attention-heading">
      <div className="border-b border-amber-200 px-4 py-3">
        <h2 id="needs-attention-heading" className="text-sm font-semibold text-amber-900">Needs attention - unanswered conversations ({rows.length})</h2>
        <p className="mt-0.5 text-xs text-amber-800">Automatic reassignment was stopped after repeated unanswered SLA expiries. Nothing happens until you resume it or the customer writes again.</p>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{error}</p>}
      <ul className="divide-y divide-amber-100">
        {rows.map((r) => (
          <li key={r.conversationId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{r.tenant.name} <span className="font-normal text-slate-500">· customer {r.customerRef}</span></p>
              <p className="text-xs text-slate-600">
                {r.consecutiveExpiries} consecutive SLA expiries (cap {r.cap}){r.slaSeconds ? ` · SLA ${r.slaSeconds}s` : ''} · last customer message {ago(r.lastCustomerMessageAt)} · last assigned to {r.lastAssignedTo ?? 'nobody'}
              </p>
            </div>
            <button disabled={busy === r.conversationId} onClick={() => resume(r.conversationId)} className="shrink-0 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {busy === r.conversationId ? 'Resuming…' : 'Resume / reassign'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
