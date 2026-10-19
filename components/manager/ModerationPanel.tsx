'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Overview {
  queue: { pending: number; inReview: number; escalated: number; decided: number }
  perOperator: { operatorId: string; number: number; name: string; decisions: number; approved: number; rejected: number; escalated: number; rejectRatePct: number | null }[]
  escalated: { id: string; kind: string; subjectExternalId: string; content: string | null; mediaUrl: string | null; flagReason: string | null }[]
  openActions: { id: string; kind: string; subjectExternalId: string; reason: string }[]
  openAppeals: { id: string; subjectExternalId: string; reason: string }[]
}

/** Moderation oversight: queue health, escalations to resolve, warnings/restrictions to confirm, appeals, per-operator decisions. */
export function ModerationPanel({ tenantId }: { tenantId?: string }) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''
  const [o, setO] = useState<Overview | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => apiFetch<Overview>(`/moderation/overview${q}`).then((d) => { setO(d); setMsg(null) }).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed to load')), [q])
  useEffect(() => { load(); const id = setInterval(load, 15_000); return () => clearInterval(id) }, [load])
  const run = (fn: () => Promise<unknown>) => fn().then(load).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))
  if (!o) return msg ? <p className="mb-8 text-sm text-slate-400">Moderation: {msg}</p> : null
  const total = o.queue.pending + o.queue.inReview + o.queue.escalated + o.queue.decided
  if (total === 0 && !msg) return null // clients without moderation items do not get an empty panel
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Moderation</h2></div>
      {msg && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      <div className="space-y-4 p-4 text-sm">
        <p className="text-slate-600">Waiting <b className="text-slate-900">{o.queue.pending}</b> · being reviewed <b className="text-slate-900">{o.queue.inReview}</b> · escalated <b className={o.queue.escalated ? 'text-amber-700' : 'text-slate-900'}>{o.queue.escalated}</b> · decided <b className="text-slate-900">{o.queue.decided}</b></p>
        {o.escalated.length > 0 && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Escalated - needs your decision</h3><ul className="space-y-2">{o.escalated.map((e) => <li key={e.id} className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-slate-500">{e.kind.toLowerCase()} · {e.subjectExternalId}{e.flagReason ? ` · ${e.flagReason}` : ''}</p><p className="my-1 text-slate-900">{e.content ?? '[media only]'}</p><span className="space-x-2"><button onClick={() => run(() => apiFetch(`/moderation/items/${e.id}/resolve`, { method: 'POST', body: JSON.stringify({ verdict: 'APPROVE' }) }))} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">Approve</button><button onClick={() => { const category = window.prompt('Violation category'); if (category) run(() => apiFetch(`/moderation/items/${e.id}/resolve`, { method: 'POST', body: JSON.stringify({ verdict: 'REJECT', category }) })) }} className="rounded bg-red-600 px-2 py-1 text-xs text-white">Reject</button></span></li>)}</ul></div>}
        {o.openActions.length > 0 && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Warnings / restrictions to confirm</h3><ul className="space-y-1">{o.openActions.map((a) => <li key={a.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2"><span>{a.kind.toLowerCase()} for <b>{a.subjectExternalId}</b>: {a.reason}</span><span className="space-x-2"><button onClick={() => run(() => apiFetch(`/moderation/actions/${a.id}/decide`, { method: 'POST', body: JSON.stringify({ applied: true }) }))} className="text-xs font-medium text-emerald-700 hover:underline">Confirm</button><button onClick={() => run(() => apiFetch(`/moderation/actions/${a.id}/decide`, { method: 'POST', body: JSON.stringify({ applied: false }) }))} className="text-xs font-medium text-red-600 hover:underline">Decline</button></span></li>)}</ul><p className="mt-1 text-xs text-slate-400">Confirming records the decision. Applying it on the client&apos;s platform needs that client&apos;s API (not connected).</p></div>}
        {o.openAppeals.length > 0 && <div><h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Appeals</h3><ul className="space-y-1">{o.openAppeals.map((a) => <li key={a.id} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2"><span><b>{a.subjectExternalId}</b>: {a.reason}</span><span className="space-x-2"><button onClick={() => run(() => apiFetch(`/moderation/appeals/${a.id}/decide`, { method: 'POST', body: JSON.stringify({ outcome: 'UPHELD' }) }))} className="text-xs font-medium text-slate-700 hover:underline">Uphold</button><button onClick={() => run(() => apiFetch(`/moderation/appeals/${a.id}/decide`, { method: 'POST', body: JSON.stringify({ outcome: 'OVERTURNED', category: window.prompt('If this becomes a rejection, which category? (leave empty if it is being approved)') || null }) }))} className="text-xs font-medium text-emerald-700 hover:underline">Overturn</button></span></li>)}</ul></div>}
        {o.perOperator.length > 0 && <table className="w-full text-left"><thead className="text-xs uppercase text-slate-400"><tr><th>Operator (7 days)</th><th>Decisions</th><th>Approved</th><th>Rejected</th><th>Escalated</th><th>Reject rate</th></tr></thead><tbody>{o.perOperator.map((p) => <tr key={p.operatorId} className="border-t border-slate-100"><td className="py-1">#{p.number} {p.name}</td><td>{p.decisions}</td><td>{p.approved}</td><td>{p.rejected}</td><td>{p.escalated}</td><td>{p.rejectRatePct === null ? '–' : `${p.rejectRatePct}%`}</td></tr>)}</tbody></table>}
      </div>
    </section>
  )
}
