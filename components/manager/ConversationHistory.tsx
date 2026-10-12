'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatusPill } from '@/components/ui/StatusPill'
import { languageLabel, normalizeLanguage } from '@/lib/languages'

interface Item { id: string; customer: string; state: string; language: string | null; updatedAt: string; messageCount: number; lastMessage: { direction: string; snippet: string } | null; operator: string | null; escalated: boolean }
interface Transcript { id: string; customer: string; state: string; language: string | null; messages: { id: string; direction: string; content: string; at: string; operator: string | null }[]; notes: { id: string; body: string; at: string; author: string }[] }
const STATES = ['QUEUED', 'ACTIVE', 'WAITING_FOR_OPERATOR', 'WAITING_FOR_CLIENT', 'REASSIGNING', 'EXPIRED', 'CLOSED']

// Searchable conversation history for supervisors, with a read-only transcript and resolve / reopen controls.
export function ConversationHistory() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState('')
  const [language, setLanguage] = useState('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Transcript | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '10' })
    if (query) p.set('q', query)
    if (state) p.set('state', state)
    if (language) p.set('language', language)
    return fetch(`/api/v1/conversations/search?${p}`, { credentials: 'include' })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j?.ok) throw new Error(j?.error?.message ?? `Request failed: ${r.status}`); setItems(j.data); setTotal(j.meta.total); setError(null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [page, query, state, language])
  useEffect(() => { load() }, [load])

  async function view(id: string) {
    try { setOpen(await apiFetch<Transcript>(`/conversations/${id}/transcript`)); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open') }
  }
  async function act(id: string, what: 'resolve' | 'reopen') {
    try { await apiFetch(`/conversations/${id}/${what}`, { method: 'POST' }); await load(); await view(id) } catch (e) { setError(e instanceof Error ? e.message : `Could not ${what}`) }
  }
  const pages = Math.max(Math.ceil(total / 10), 1)

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="hist-title">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 id="hist-title" className="text-sm font-semibold text-slate-900">Conversation history</h2>
        <p className="text-xs text-slate-500">Search by customer or message text. Supervisors only.</p>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1) }}>
          <input aria-label="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer or message text" maxLength={100} className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Search</button>
        </form>
        <select aria-label="Filter by state" value={state} onChange={(e) => { setState(e.target.value); setPage(1) }} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
          <option value="">Any state</option>
          {STATES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
        </select>
        <input aria-label="Filter by language code" value={language} onChange={(e) => { setLanguage(e.target.value); setPage(1) }} placeholder="Language (en, es…)" maxLength={5} className="w-32 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.1fr]">
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {items.map((c) => (
            <li key={c.id}>
              <button onClick={() => view(c.id)} className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${open?.id === c.id ? 'bg-slate-50' : ''}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{c.customer}{normalizeLanguage(c.language) && <span className="ml-1.5 rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">{c.language}</span>}{c.escalated && <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">ESCALATED</span>}</span>
                  <StatusPill status={c.state} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">{c.lastMessage ? `${c.lastMessage.direction === 'OUTBOUND' ? 'Reply: ' : ''}${c.lastMessage.snippet}` : 'No messages'} · {c.messageCount} msg{c.operator ? ` · ${c.operator}` : ''}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No conversations match.</li>}
        </ul>
        <div className="rounded-lg border border-slate-100 p-3 text-sm">
          {!open ? <p className="text-slate-400">Select a conversation to read its transcript.</p> : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-900">{open.customer} <span className="font-normal text-slate-500">· {languageLabel(open.language)}</span></p>
                {open.state === 'CLOSED'
                  ? <button onClick={() => act(open.id, 'reopen')} className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium">Reopen</button>
                  : <button onClick={() => act(open.id, 'resolve')} className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">Resolve</button>}
              </div>
              <ol className="max-h-72 space-y-1.5 overflow-y-auto">
                {open.messages.map((m) => (
                  <li key={m.id} className={`rounded px-2.5 py-1.5 text-xs ${m.direction === 'OUTBOUND' ? 'bg-indigo-50 text-slate-800' : 'bg-slate-50 text-slate-700'}`}>
                    <span className="font-medium text-slate-500">{m.direction === 'OUTBOUND' ? `${m.operator ?? 'Operator'}: ` : 'Customer: '}</span>{m.content}
                  </li>
                ))}
              </ol>
              {open.notes.length > 0 && <div className="mt-2 border-t border-slate-100 pt-2"><p className="text-xs font-semibold text-slate-500">Internal notes</p>{open.notes.map((n) => <p key={n.id} className="mt-1 text-xs text-slate-600">{n.body} <span className="text-slate-400">— {n.author}</span></p>)}</div>}
            </>
          )}
        </div>
      </div>
      {total > 10 && (
        <div className="flex items-center justify-between px-4 pb-4 text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages} · {total} results</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40">Next</button>
        </div>
      )}
    </section>
  )
}
