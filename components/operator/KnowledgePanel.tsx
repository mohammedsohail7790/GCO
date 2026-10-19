'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Entry { id: string; kind: 'QUICK_REPLY' | 'ARTICLE' | 'INSTRUCTION'; title: string; body: string; language: string | null }

/** The client's instructions, quick replies and articles for the conversation language. Clicking a quick reply drops it into the draft (never sends). */
export function KnowledgePanel({ language, onInsert }: { language: string | null; onInsert: (text: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch<Entry[]>(`/operators/me/knowledge?language=${encodeURIComponent(language ?? '')}&q=${encodeURIComponent(q)}`).then(setEntries).catch(() => setEntries([]))
    }, 200)
    return () => clearTimeout(t)
  }, [language, q])

  const group = (kind: Entry['kind'], label: string) => {
    const rows = entries.filter((e) => e.kind === kind)
    if (rows.length === 0) return null
    return (
      <div className="mt-2">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <ul className="space-y-1">
          {rows.map((e) => (
            <li key={e.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {kind === 'QUICK_REPLY' ? (
                <button onClick={() => onInsert(e.body)} className="block w-full text-left" title="Insert into your reply"><span className="font-medium text-slate-800">{e.title}</span><span className="mt-0.5 block truncate text-slate-500">{e.body}</span></button>
              ) : (
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="block w-full text-left"><span className="font-medium text-slate-800">{e.title}</span>{open === e.id && <span className="mt-1 block whitespace-pre-wrap text-slate-600">{e.body}</span>}</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="mt-5">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Client knowledge</h3>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
      {entries.length === 0 && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">Nothing for this language yet.</p>}
      {group('INSTRUCTION', 'Instructions')}
      {group('QUICK_REPLY', 'Quick replies')}
      {group('ARTICLE', 'Articles')}
    </div>
  )
}
