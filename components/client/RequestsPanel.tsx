'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Req { id: string; kind: string; subject: string; status: string; updatedAt: string }
interface Thread { request: { id: string; subject: string; status: string }; messages: { id: string; fromClient: boolean; body: string; createdAt: string }[] }
const KIND = { MESSAGE: 'Message to my account manager', WORKFLOW_CHANGE: 'Change a workflow', INSTRUCTION_CHANGE: 'Change instructions', SETTINGS_CHANGE: 'Change project settings' } as const

/** Requests to GCO and the conversation with the account team. */
export function RequestsPanel() {
  const [rows, setRows] = useState<Req[]>([])
  const [open, setOpen] = useState<Thread | null>(null)
  const [reply, setReply] = useState('')
  const [f, setF] = useState({ kind: 'MESSAGE', subject: '', body: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => apiFetch<Req[]>('/client/requests').then(setRows).catch(() => {}), [])
  useEffect(() => { load() }, [load])
  const openThread = (id: string) => apiFetch<Thread>(`/client/requests/${id}/messages`).then(setOpen).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Requests and messages to GCO</h2></div>
      {msg && <p className="bg-slate-50 px-4 py-2 text-sm text-slate-700">{msg}</p>}
      <form className="grid gap-2 p-4 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); apiFetch('/client/requests', { method: 'POST', body: JSON.stringify(f) }).then(() => { setMsg('Sent. Your GCO team has been notified.'); setF({ ...f, subject: '', body: '' }); return load() }).catch((err) => setMsg(err instanceof Error ? err.message : 'Failed')) }}>
        <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input required minLength={3} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Subject" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" />
        <textarea required minLength={3} rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="What do you need?" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" />
        <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Send</button>
      </form>
      {rows.length > 0 && <ul className="divide-y divide-slate-100 text-sm">{rows.map((r) => <li key={r.id}><button onClick={() => openThread(r.id)} className="flex w-full justify-between px-4 py-2 text-left hover:bg-slate-50"><span><b className="text-slate-900">{r.subject}</b> <span className="text-xs text-slate-400">{KIND[r.kind as keyof typeof KIND]}</span></span><span className="text-xs text-slate-500">{r.status.toLowerCase().replace('_', ' ')}</span></button></li>)}</ul>}
      {open && (
        <div className="border-t border-slate-200 p-4 text-sm">
          <h3 className="mb-2 font-semibold text-slate-900">{open.request.subject} <span className="text-xs font-normal text-slate-500">({open.request.status.toLowerCase().replace('_', ' ')})</span></h3>
          <ul className="space-y-2">{open.messages.map((m) => <li key={m.id} className={`rounded-lg px-3 py-2 ${m.fromClient ? 'bg-slate-50' : 'bg-brand-50 text-slate-900'}`}><span className="text-xs text-slate-500">{m.fromClient ? 'You' : 'Your GCO team'} · {new Date(m.createdAt).toLocaleString('en-GB')}</span><br />{m.body}</li>)}</ul>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); apiFetch(`/client/requests/${open.request.id}/messages`, { method: 'POST', body: JSON.stringify({ body: reply }) }).then(() => { setReply(''); return openThread(open.request.id) }).then(load).catch((err) => setMsg(err instanceof Error ? err.message : 'Failed')) }}>
            <input required value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5" /><button className="rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white">Reply</button>
          </form>
        </div>
      )}
    </section>
  )
}
