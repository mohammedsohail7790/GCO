'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Req { id: string; tenantName: string; kind: string; subject: string; status: string; updatedAt: string }
interface Thread { request: { id: string; subject: string; status: string }; messages: { id: string; fromClient: boolean; body: string; createdAt: string }[] }

/** Client requests and account-manager messages (managers: their own client; CEO/assistant: all). */
export function RequestsInbox() {
  const [rows, setRows] = useState<Req[]>([])
  const [open, setOpen] = useState<Thread | null>(null)
  const [reply, setReply] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => apiFetch<Req[]>('/client-requests').then(setRows).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed')), [])
  useEffect(() => { load(); const id = setInterval(load, 20_000); return () => clearInterval(id) }, [load])
  const openThread = (id: string) => apiFetch<Thread>(`/client-requests/${id}/messages`).then(setOpen).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))
  const status = (id: string, s: string) => { const note = s === 'DECLINED' ? window.prompt('Why are you declining? The client will see this.') : null; if (s === 'DECLINED' && !note) return; apiFetch(`/client-requests/${id}/messages`, { method: 'PATCH', body: JSON.stringify({ status: s, note }) }).then(() => openThread(id)).then(load).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed')) }
  const live = rows.filter((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS')
  if (rows.length === 0 && !msg) return null
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Client requests <span className="font-normal text-slate-500">({live.length} open)</span></h2></div>
      {msg && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      <ul className="divide-y divide-slate-100 text-sm">{rows.map((r) => <li key={r.id}><button onClick={() => openThread(r.id)} className="flex w-full justify-between px-4 py-2 text-left hover:bg-slate-50"><span><b className="text-slate-900">{r.subject}</b> <span className="text-xs text-slate-400">{r.tenantName} · {r.kind.toLowerCase().replace('_', ' ')}</span></span><span className="text-xs text-slate-500">{r.status.toLowerCase().replace('_', ' ')}</span></button></li>)}</ul>
      {open && (
        <div className="border-t border-slate-200 p-4 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{open.request.subject}</h3>{(['IN_PROGRESS', 'DONE', 'DECLINED', 'OPEN'] as const).map((s) => <button key={s} disabled={open.request.status === s} onClick={() => status(open.request.id, s)} className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40">{s.toLowerCase().replace('_', ' ')}</button>)}</div>
          <ul className="space-y-2">{open.messages.map((m) => <li key={m.id} className={`rounded-lg px-3 py-2 ${m.fromClient ? 'bg-slate-50' : 'bg-brand-50 text-slate-900'}`}><span className="text-xs text-slate-500">{m.fromClient ? 'Client' : 'GCO'} · {new Date(m.createdAt).toLocaleString('en-GB')}</span><br />{m.body}</li>)}</ul>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); apiFetch(`/client-requests/${open.request.id}/messages`, { method: 'POST', body: JSON.stringify({ body: reply }) }).then(() => { setReply(''); return openThread(open.request.id) }).then(load).catch((err) => setMsg(err instanceof Error ? err.message : 'Failed')) }}>
            <input required value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the client (they are notified)" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5" /><button className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white">Reply</button>
          </form>
        </div>
      )}
    </section>
  )
}
