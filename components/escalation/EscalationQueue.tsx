'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useRealtime } from '@/lib/realtime/useRealtime'
import { LEVEL_LABELS, REASON_LABELS, STATUS_LABELS } from './labels'

interface EventRow {
  id: string
  action: string
  visibility: string
  body: string | null
  createdAt: string
}
interface Row {
  id: string
  tenantId: string
  level: 'SUPERVISOR' | 'CLIENT_DECISION'
  status: 'OPEN' | 'CLAIMED' | 'RESOLVED'
  reason: string
  summary: string
  createdAt: string
  conversation?: { externalUserId: string; state: string }
  events: EventRow[]
}

// Supervisor / management escalation queue. `mode` only chooses which buttons to SHOW; the
// server enforces who may do what at each level (RBAC + tenant scope).
export function EscalationQueue({ mode }: { mode: 'supervisor' | 'management' }) {
  const [rows, setRows] = useState<Row[]>([])
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [text, setText] = useState<Record<string, string>>({})
  const [clientText, setClientText] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    apiFetch<Row[]>(`/escalations${showResolved ? '?includeResolved=1' : ''}`)
      .then((d) => {
        setRows(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load escalations'))
  }, [showResolved])

  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])
  useRealtime(load, true)

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(id)
    setError(null)
    try {
      await apiFetch(`/escalations/${id}/actions`, { method: 'POST', body: JSON.stringify(body) })
      setText((t) => ({ ...t, [id]: '' }))
      setClientText((t) => ({ ...t, [id]: '' }))
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  const awaitingClient = rows.filter((r) => r.level === 'CLIENT_DECISION' && r.status !== 'RESOLVED').length

  return (
    <section aria-labelledby="esc-queue-title" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 id="esc-queue-title" className="text-sm font-semibold text-slate-900">
          Escalations {mode === 'management' && awaitingClient > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{awaitingClient} awaiting client decision</span>}
        </h2>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved
        </label>
      </div>
      {error && <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => {
          const supervisorLevel = r.level === 'SUPERVISOR'
          const canResolve = supervisorLevel || mode === 'management'
          const canClaim = supervisorLevel || mode === 'management'
          return (
            <li key={r.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{r.conversation?.externalUserId ?? 'Conversation'}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' : r.status === 'CLAIMED' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>
                  {STATUS_LABELS[r.status]}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{LEVEL_LABELS[r.level]}</span>
                <span className="text-xs text-slate-500">{REASON_LABELS[r.reason]}</span>
                <span className="ml-auto text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-medium">Operator note:</span> {r.summary}
              </p>
              {r.events.filter((e) => e.action !== 'raised').length > 0 && (
                <ol className="space-y-1 border-l-2 border-slate-100 pl-3 text-xs text-slate-600">
                  {r.events
                    .filter((e) => e.action !== 'raised')
                    .map((e) => (
                      <li key={e.id}>
                        <span className="font-medium">{e.action.replace(/_/g, ' ')}</span>
                        {e.visibility === 'CLIENT' && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] text-indigo-700">client-visible</span>}
                        {e.body ? `: ${e.body}` : ''} <span className="text-slate-400">· {new Date(e.createdAt).toLocaleTimeString()}</span>
                      </li>
                    ))}
                </ol>
              )}
              {r.status !== 'RESOLVED' && (
                <div className="space-y-2">
                  <label className="sr-only" htmlFor={`note-${r.id}`}>Note or resolution</label>
                  <textarea id={`note-${r.id}`} rows={2} placeholder="Internal note / resolution…" value={text[r.id] ?? ''} onChange={(e) => setText((t) => ({ ...t, [r.id]: e.target.value }))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  {(supervisorLevel || mode === 'management') && (
                    <>
                      <label className="sr-only" htmlFor={`cs-${r.id}`}>{supervisorLevel ? 'Client-facing summary' : 'Client-visible decision note'}</label>
                      <input
                        id={`cs-${r.id}`}
                        placeholder={supervisorLevel ? 'Client-facing summary (needed to escalate to a client decision)' : 'Client-visible note / decision (optional, shown to the client)'}
                        value={clientText[r.id] ?? ''}
                        onChange={(e) => setClientText((t) => ({ ...t, [r.id]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'OPEN' && canClaim && (
                      <button disabled={busy === r.id} onClick={() => act(r.id, { action: 'claim' })} className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                        Claim
                      </button>
                    )}
                    <button disabled={busy === r.id || !(text[r.id] ?? '').trim()} onClick={() => act(r.id, { action: 'note', body: text[r.id] })} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      Add internal note
                    </button>
                    {!supervisorLevel && mode === 'management' && (
                      <button disabled={busy === r.id || !(clientText[r.id] ?? '').trim()} onClick={() => act(r.id, { action: 'note', body: clientText[r.id], visibility: 'CLIENT' })} className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                        Add client-visible note
                      </button>
                    )}
                    {supervisorLevel && (
                      <button disabled={busy === r.id || (text[r.id] ?? '').trim().length < 5 || (clientText[r.id] ?? '').trim().length < 5} onClick={() => act(r.id, { action: 'escalate', note: text[r.id], clientSummary: clientText[r.id] })} className="rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                        Escalate to client decision
                      </button>
                    )}
                    {canResolve && (
                      <button disabled={busy === r.id || (text[r.id] ?? '').trim().length < 3} onClick={() => act(r.id, { action: 'resolve', resolution: text[r.id], ...(!supervisorLevel && (clientText[r.id] ?? '').trim() ? { clientNote: clientText[r.id] } : {}) })} className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              )}
              {r.status === 'RESOLVED' && <p className="text-xs text-emerald-700">Resolved{r.events.length ? '' : ''}.</p>}
            </li>
          )
        })}
        {rows.length === 0 && <li className="p-4 text-sm text-slate-400">No {showResolved ? '' : 'open '}escalations.</li>}
      </ul>
    </section>
  )
}
