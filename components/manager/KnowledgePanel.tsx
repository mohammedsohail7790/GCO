'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Entry { id: string; kind: 'QUICK_REPLY' | 'ARTICLE' | 'INSTRUCTION'; title: string; body: string; language: string | null; tags: string[] }
const LABEL = { QUICK_REPLY: 'Quick reply', ARTICLE: 'Article', INSTRUCTION: 'Instruction' } as const

/** Maintain a client's quick replies, articles and standing instructions (per language). */
export function ManagerKnowledgePanel({ tenantId }: { tenantId?: string }) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''
  const [rows, setRows] = useState<Entry[]>([])
  const [f, setF] = useState({ kind: 'QUICK_REPLY', title: '', body: '', language: '', tags: '' })
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const load = useCallback(() => apiFetch<Entry[]>(`/knowledge${q}`).then(setRows).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load' })), [q])
  useEffect(() => { load() }, [load])
  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ kind: 'ok', text: ok }); return load() }).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Client knowledge: quick replies, articles and instructions</h2></div>
      {msg && <p className={`px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="space-y-4 p-4">
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); act(() => apiFetch('/knowledge', { method: 'POST', body: JSON.stringify({ ...(tenantId ? { tenantId } : {}), kind: f.kind, title: f.title, body: f.body, language: f.language || null, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) }) }).then(() => setF({ ...f, title: '', body: '', tags: '' })), 'Saved.') }}>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="QUICK_REPLY">Quick reply</option><option value="INSTRUCTION">Instruction</option><option value="ARTICLE">Article</option></select>
          <input required minLength={2} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" />
          <input value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} maxLength={10} placeholder="Language (en, es… empty = all)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <textarea required rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Text" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-3" />
          <div className="flex flex-col gap-2"><input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="tags, comma separated" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" /><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Add</button></div>
        </form>
        {rows.length === 0 ? <p className="text-sm text-slate-400">Nothing yet. Operators will see what you add here, filtered by the conversation language.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((e) => <li key={e.id} className="flex items-start justify-between gap-4 py-2"><span><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{LABEL[e.kind]}{e.language ? ` · ${e.language}` : ''}</span><b className="text-slate-900">{e.title}</b><span className="ml-2 text-slate-500">{e.body.slice(0, 90)}{e.body.length > 90 ? '…' : ''}</span></span><button onClick={() => act(() => apiFetch(`/knowledge/${e.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) }), 'Archived.')} className="shrink-0 text-xs text-red-600 hover:underline">Archive</button></li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
