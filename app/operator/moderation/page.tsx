'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Item { id: string; kind: string; subjectExternalId: string; content: string | null; mediaUrl: string | null; flagReason: string | null; language: string | null; priority: number; createdAt: string }
interface History { items: { id: string; kind: string; status: string; content: string | null; createdAt: string; decisions: { verdict: string; category: string | null; note: string | null }[] }[]; actions: { id: string; kind: string; status: string; reason: string }[] }

export default function OperatorModerationPage() {
  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [history, setHistory] = useState<{ subject: string; data: History } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(() => apiFetch<{ items: Item[]; categories: string[] }>('/moderation/mine').then((d) => { setItems(d.items); setCategories(d.categories) }).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed to load')), [])
  useEffect(() => { load() }, [load])
  const run = (fn: () => Promise<unknown>, ok?: string) => fn().then(() => { if (ok) setMsg(ok); setNote(''); setCategory(''); return load() }).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))
  const current = items[0]

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-900">Moderation queue</span>
        <div className="flex items-center gap-4"><span className="text-xs text-slate-500">{items.length} item(s) held by you</span><a href="/operator" className="text-xs font-medium text-brand-600 hover:underline">Back to conversations</a></div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {msg && <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{msg}</p>}
        <button onClick={() => run(() => apiFetch('/moderation/claim', { method: 'POST', body: '{}' }), 'Claimed the next items.')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Get next items</button>
        {!current && <p className="text-sm text-slate-400">You have no items. Press &ldquo;Get next items&rdquo;. Items you leave untouched for 15 minutes go back to the queue.</p>}
        {current && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{current.kind.toLowerCase()} · person <b className="text-slate-800">{current.subjectExternalId}</b>{current.language ? ` · ${current.language}` : ''}</span><span>{current.flagReason ?? ''}</span></div>
            {current.content && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-900">{current.content}</p>}
            {current.mediaUrl && <p className="mt-2 text-sm"><a href={current.mediaUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="font-medium text-brand-600 hover:underline">Open the attached media (opens the client&apos;s link in a new tab)</a></p>}
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="">Violation category (for Reject)…</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to escalate)" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => run(() => apiFetch(`/moderation/items/${current.id}/decide`, { method: 'POST', body: JSON.stringify({ verdict: 'APPROVE', note: note || null }) }))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Approve</button>
              <button onClick={() => run(() => apiFetch(`/moderation/items/${current.id}/decide`, { method: 'POST', body: JSON.stringify({ verdict: 'REJECT', category: category || null, note: note || null }) }))} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white">Reject</button>
              <button onClick={() => run(() => apiFetch(`/moderation/items/${current.id}/decide`, { method: 'POST', body: JSON.stringify({ verdict: 'ESCALATE', note }) }))} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">Escalate</button>
              <button onClick={() => run(() => apiFetch(`/moderation/items/${current.id}/release`, { method: 'POST', body: '{}' }))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Give back</button>
              <span className="mx-1 w-px bg-slate-200" />
              {(['WARNING', 'RESTRICTION'] as const).map((k) => <button key={k} onClick={() => { if (note.trim().length < 5) { setMsg('Write a reason in the note first.'); return } run(() => apiFetch('/moderation/actions', { method: 'POST', body: JSON.stringify({ subjectExternalId: current.subjectExternalId, kind: k, itemId: current.id, reason: note }) }), `${k === 'WARNING' ? 'Warning' : 'Restriction'} requested - a supervisor confirms it.`) }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Request {k.toLowerCase()}</button>)}
              <button onClick={() => apiFetch<History>(`/moderation/history?subject=${encodeURIComponent(current.subjectExternalId)}`).then((d) => setHistory({ subject: current.subjectExternalId, data: d })).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Person history</button>
            </div>
          </section>
        )}
        {history && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
            <h2 className="mb-2 font-semibold text-slate-900">History of {history.subject}</h2>
            {history.data.items.length === 0 ? <p className="text-slate-400">Nothing earlier.</p> : <ul className="space-y-1">{history.data.items.map((i) => <li key={i.id} className="rounded bg-slate-50 px-3 py-1.5"><span className="text-xs text-slate-500">{i.kind.toLowerCase()} · {new Date(i.createdAt).toLocaleDateString('en-GB')} · {i.status.toLowerCase()}{i.decisions.length ? ` · ${i.decisions.map((d) => d.verdict.toLowerCase() + (d.category ? ` (${d.category})` : '')).join(' → ')}` : ''}</span><br />{i.content ? i.content.slice(0, 160) : '[no text]'}</li>)}</ul>}
            {history.data.actions.length > 0 && <p className="mt-2 text-xs text-slate-500">Actions: {history.data.actions.map((a) => `${a.kind.toLowerCase()} ${a.status.toLowerCase()}`).join(', ')}</p>}
          </section>
        )}
        {items.length > 1 && <p className="text-xs text-slate-500">{items.length - 1} more waiting after this one.</p>}
      </main>
    </div>
  )
}
