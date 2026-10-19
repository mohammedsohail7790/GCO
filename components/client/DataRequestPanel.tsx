'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Req { id: string; kind: 'EXPORT' | 'ERASURE'; subjectHint: string; status: string; dueAt: string; completedAt: string | null }

/** A client (data controller) asks GCO (processor) to export or erase the data of one of its own end users. */
export function DataRequestPanel() {
  const [rows, setRows] = useState<Req[]>([])
  const [f, setF] = useState({ kind: 'EXPORT', subjectRef: '', note: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const load = useCallback(() => apiFetch<Req[]>('/client/data-requests').then(setRows).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Privacy requests for your end users</h2><p className="text-xs text-slate-500">Ask GCO to export or erase the conversation data of one of your users. We confirm the id with you before acting.</p></div>
      {msg && <p className={`px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <form className="grid gap-2 p-4 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); apiFetch('/client/data-requests', { method: 'POST', body: JSON.stringify({ kind: f.kind, subjectRef: f.subjectRef, note: f.note || null }) }).then(() => { setMsg({ kind: 'ok', text: 'Request received.' }); setF({ ...f, subjectRef: '', note: '' }); return load() }).catch((err) => setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' })) }}>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="EXPORT">Export their data</option><option value="ERASURE">Erase their data</option></select>
        <input required value={f.subjectRef} onChange={(e) => setF({ ...f, subjectRef: e.target.value })} placeholder="User id on your platform" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Submit request</button>
      </form>
      {rows.length > 0 && <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Type</th><th>User (last 4)</th><th>Status</th><th>Due</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-slate-100"><td className="px-4 py-1.5">{r.kind === 'EXPORT' ? 'Export' : 'Erasure'}</td><td>…{r.subjectHint}</td><td>{r.status.toLowerCase()}</td><td>{new Date(r.dueAt).toLocaleDateString('en-GB')}</td></tr>)}</tbody></table>}
    </section>
  )
}
