'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Slot { start: string; open: boolean; staffed: number; gap: boolean }
interface Shift { id: string; operatorId: string; startsAt: string; endsAt: string }
interface Absence { id: string; operatorId: string; kind: string; startsAt: string; endsAt: string }
interface Handover { id: string; body: string; createdAt: string; acknowledgedAt: string | null; fromOperatorId: string; toOperatorId: string | null }
interface OperatorRow { id: string; operatorNumber: number; user: { displayName: string } }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Shift planning for a client: next-24h coverage strip, shifts, absences and handover notes. Supervisors only see their own team. */
export function ShiftPlanner({ tenantId }: { tenantId?: string }) {
  const q = tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ''
  const [ops, setOps] = useState<OperatorRow[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [planned, setPlanned] = useState(false)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [absences, setAbsences] = useState<Absence[]>([])
  const [handovers, setHandovers] = useState<Handover[]>([])
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({ operatorId: '', start: '', end: '', kind: 'SHIFT' })

  const load = useCallback(
    () =>
      Promise.all([
        apiFetch<OperatorRow[]>(`/operators${q ? `?${q.slice(1)}` : ''}`),
        apiFetch<{ planned: boolean; slots: Slot[] }>(`/shifts/coverage?x=1${q}`),
        apiFetch<Shift[]>(`/shifts?x=1${q}`),
        apiFetch<Absence[]>(`/absences?x=1${q}`),
        apiFetch<Handover[]>(`/handovers?x=1${q}`),
      ])
        .then(([o, c, s, a, h]) => { setOps(o); setSlots(c.slots); setPlanned(c.planned); setShifts(s); setAbsences(a); setHandovers(h) })
        .catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load shifts' })),
    [q],
  )
  useEffect(() => { load() }, [load])

  const name = (id: string) => { const o = ops.find((x) => x.id === id); return o ? `#${o.operatorNumber} ${o.user.displayName}` : id.slice(-6) }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const body = { operatorId: form.operatorId, startsAt: new Date(form.start).toISOString(), endsAt: new Date(form.end).toISOString(), ...(tenantId ? { tenantId } : {}) }
      if (form.kind === 'SHIFT') await apiFetch('/shifts', { method: 'POST', body: JSON.stringify(body) })
      else { const r = await apiFetch<{ affectedShifts: number }>('/absences', { method: 'POST', body: JSON.stringify({ ...body, kind: form.kind }) }); setMsg({ kind: 'ok', text: `Absence recorded. ${r.affectedShifts} planned shift(s) are affected.` }) }
      if (form.kind === 'SHIFT') setMsg({ kind: 'ok', text: 'Shift added.' })
      await load()
    } catch (err) { setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' }) }
  }
  const cancel = (id: string) => apiFetch(`/shifts/${id}`, { method: 'DELETE' }).then(load).catch((err) => setMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Failed' }))

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Shifts, absences and coverage</h2></div>
      {msg && <p className={`px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="p-4">
        <p className="mb-1 text-xs text-slate-500">Next 24 hours{planned ? '' : ' - no shifts planned yet, so gaps are not flagged'} (green = staffed, red = open with nobody scheduled, grey = closed)</p>
        <div className="flex gap-0.5">
          {slots.map((s) => <div key={s.start} title={`${when(s.start)} - ${s.staffed} on shift`} className={`h-6 flex-1 rounded-sm ${!s.open ? 'bg-slate-200' : s.staffed > 0 ? 'bg-emerald-400' : planned ? 'bg-red-400' : 'bg-slate-300'}`} />)}
        </div>

        <form onSubmit={submit} className="mt-4 grid gap-2 sm:grid-cols-5">
          <select required value={form.operatorId} onChange={(e) => setForm({ ...form, operatorId: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="">Operator…</option>{ops.map((o) => <option key={o.id} value={o.id}>#{o.operatorNumber} {o.user.displayName}</option>)}</select>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="SHIFT">Shift</option><option value="SICK">Absence: sick</option><option value="LEAVE">Absence: leave</option><option value="NO_SHOW">Absence: no-show</option><option value="OTHER">Absence: other</option></select>
          <input type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <input type="datetime-local" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Add</button>
        </form>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Planned shifts (7 days)</h3>
            {shifts.length === 0 ? <p className="text-sm text-slate-400">None.</p> : <ul className="divide-y divide-slate-100 text-sm">{shifts.map((s) => <li key={s.id} className="flex items-center justify-between py-1"><span>{name(s.operatorId)} · {when(s.startsAt)} → {when(s.endsAt)}</span><button onClick={() => cancel(s.id)} className="text-xs text-red-600 hover:underline">Cancel</button></li>)}</ul>}
          </div>
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Absences</h3>
            {absences.length === 0 ? <p className="text-sm text-slate-400">None.</p> : <ul className="divide-y divide-slate-100 text-sm">{absences.map((a) => <li key={a.id} className="py-1">{name(a.operatorId)} · {a.kind.toLowerCase()} · {when(a.startsAt)} → {when(a.endsAt)}</li>)}</ul>}
          </div>
        </div>

        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">Recent handovers</h3>
        {handovers.length === 0 ? <p className="text-sm text-slate-400">None.</p> : <ul className="space-y-1 text-sm">{handovers.slice(0, 8).map((h) => <li key={h.id} className="rounded-lg bg-slate-50 px-3 py-2"><span className="text-xs text-slate-500">{name(h.fromOperatorId)} → {h.toOperatorId ? name(h.toOperatorId) : 'team'} · {when(h.createdAt)} · {h.acknowledgedAt ? 'acknowledged' : 'not yet acknowledged'}</span><br />{h.body}</li>)}</ul>}
      </div>
    </section>
  )
}
