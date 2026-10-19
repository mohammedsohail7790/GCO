'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Mine { shifts: { id: string; startsAt: string; endsAt: string; note: string | null }[]; absences: { id: string; kind: string; startsAt: string; endsAt: string }[] }
interface Handover { id: string; body: string; createdAt: string; acknowledgedAt: string | null; fromOperatorId: string; toOperatorId: string | null }
interface Held { assignmentId: string; conversation: { id: string; externalUserId: string } }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function OperatorSchedulePage() {
  const [mine, setMine] = useState<Mine | null>(null)
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [held, setHeld] = useState<Held[]>([])
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(
    () =>
      Promise.all([
        apiFetch<Mine>('/operators/me/shifts'),
        apiFetch<Handover[]>('/handovers'),
        apiFetch<{ operator: { id: string }; conversations: Held[] }>('/operators/me/workspace'),
      ])
        .then(([m, h, w]) => { setMine(m); setHandovers(h); setMe(w.operator.id); setHeld(w.conversations) })
        .catch((e) => setMsg(e instanceof Error ? e.message : 'Failed to load')),
    [],
  )
  useEffect(() => { load() }, [load])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    try { await apiFetch('/handovers', { method: 'POST', body: JSON.stringify({ body: note, conversationIds: picked }) }); setNote(''); setPicked([]); setMsg('Handover note sent to the team.'); await load() } catch (err) { setMsg(err instanceof Error ? err.message : 'Failed') }
  }
  const ack = (id: string) => apiFetch(`/handovers/${id}/ack`, { method: 'POST', body: '{}' }).then(load).catch((err) => setMsg(err instanceof Error ? err.message : 'Failed'))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-900">My schedule and handovers</span>
        <a href="/operator" className="text-xs font-medium text-brand-600 hover:underline">Back to conversations</a>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-4">
        {msg && <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{msg}</p>}
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Upcoming shifts</h2>
          {!mine || mine.shifts.length === 0 ? <p className="text-sm text-slate-400">No shifts planned.</p> : <ul className="divide-y divide-slate-100 text-sm">{mine.shifts.map((s) => <li key={s.id} className="py-1.5">{when(s.startsAt)} → {when(s.endsAt)}{s.note ? <span className="ml-2 text-xs text-slate-400">{s.note}</span> : null}</li>)}</ul>}
          {mine && mine.absences.length > 0 && <><h3 className="mb-1 mt-3 text-xs font-semibold uppercase text-slate-500">Absences</h3><ul className="text-sm">{mine.absences.map((a) => <li key={a.id}>{a.kind.toLowerCase()} · {when(a.startsAt)} → {when(a.endsAt)}</li>)}</ul></>}
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Hand over to the next shift</h2>
          <form onSubmit={send} className="space-y-2">
            <textarea required minLength={3} maxLength={2000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What does the next operator need to know?" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {held.length > 0 && <fieldset className="text-sm"><legend className="text-xs text-slate-500">Conversations you currently hold</legend>{held.map((h) => <label key={h.conversation.id} className="mr-4 inline-flex items-center gap-1"><input type="checkbox" checked={picked.includes(h.conversation.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, h.conversation.id] : picked.filter((x) => x !== h.conversation.id))} />{h.conversation.externalUserId}</label>)}</fieldset>}
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Send handover</button>
          </form>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Handover notes</h2>
          {handovers.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : <ul className="space-y-2 text-sm">{handovers.map((h) => <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-xs text-slate-500">{h.fromOperatorId === me ? 'You' : 'A colleague'} · {when(h.createdAt)}{h.acknowledgedAt ? ' · acknowledged' : ''}</span><br />{h.body}{!h.acknowledgedAt && h.fromOperatorId !== me && <button onClick={() => ack(h.id)} className="ml-3 text-xs font-medium text-brand-600 hover:underline">Acknowledge</button>}</li>)}</ul>}
        </section>
      </main>
    </div>
  )
}
