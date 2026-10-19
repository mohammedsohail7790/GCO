'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Colleague { id: string; name: string; free: number; languages: string[] }

/** Hand the conversation to an available colleague (same client, covers the language, has a free slot). */
export function TransferButton({ assignmentId, language, onDone }: { assignmentId: string; language: string | null; onDone: () => void }) {
  const [list, setList] = useState<Colleague[] | null>(null)
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const open = () => apiFetch<Colleague[]>(`/operators/me/colleagues?language=${encodeURIComponent(language ?? '')}`).then(setList).catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))
  if (list === null) return <button onClick={open} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Transfer</button>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      {list.length === 0 ? <span className="text-slate-500">No colleague is free for this conversation right now.</span> : (
        <>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-1.5 py-1"><option value="">To…</option>{list.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.free} free)</option>)}</select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="w-36 rounded border border-slate-300 px-1.5 py-1" />
          <button disabled={!to} onClick={() => apiFetch(`/assignments/${assignmentId}/transfer`, { method: 'POST', body: JSON.stringify({ toOperatorId: to, reason }) }).then(onDone).catch((e) => setErr(e instanceof Error ? e.message : 'Failed'))} className="rounded bg-slate-900 px-2 py-1 font-medium text-white disabled:opacity-50">Send</button>
        </>
      )}
      <button onClick={() => { setList(null); setErr(null) }} className="text-slate-500 hover:underline">cancel</button>
      {err && <span className="text-red-600">{err}</span>}
    </span>
  )
}
