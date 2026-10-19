'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Live {
  asOf: string
  service: { status: 'covered' | 'no-operator-online' | 'outside-hours' | 'paused'; responseTargetSeconds: number }
  queue: { waiting: number; inProgress: number; waitingForCustomer: number; oldestWaitSeconds: number | null }
  team: { online: number; total: number; onShiftNow: number; members: { firstName: string; status: string; languages: string[]; capacity: number }[] }
  today: { conversationsAssigned: number; answered: number; onTimePercent: number | null }
}
const STATUS = { covered: ['Covered', 'bg-emerald-100 text-emerald-700'], 'no-operator-online': ['No operator online', 'bg-red-100 text-red-700'], 'outside-hours': ['Outside operating hours', 'bg-slate-100 text-slate-600'], paused: ['Service paused', 'bg-amber-100 text-amber-800'] } as const

/** Live view of the client's own operation, refreshed every 10 seconds. */
export function LivePanel() {
  const [d, setD] = useState<Live | null>(null)
  useEffect(() => {
    const load = () => apiFetch<Live>('/client/live').then(setD).catch(() => {})
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])
  if (!d) return null
  const [label, cls] = STATUS[d.service.status]
  const wait = d.queue.oldestWaitSeconds
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold text-slate-900">Live operations</h2><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span><span className="text-xs text-slate-400">Reply target {d.service.responseTargetSeconds}s · updated {new Date(d.asOf).toLocaleTimeString('en-GB')}</span></div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {([['Waiting', d.queue.waiting, wait !== null ? `oldest ${Math.floor(wait / 60)}m ${wait % 60}s` : 'none waiting'], ['In progress', d.queue.inProgress, `${d.queue.waitingForCustomer} waiting for your customer`], ['Team online', `${d.team.online}/${d.team.total}`, `${d.team.onShiftNow} on shift now`], ['On time today', d.today.onTimePercent === null ? '–' : `${d.today.onTimePercent}%`, `${d.today.answered} answered`]] as const).map(([l, v, s]) => <div key={l} className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase text-slate-500">{l}</p><p className="text-xl font-semibold tabular-nums text-slate-900">{v}</p><p className="text-xs text-slate-400">{s}</p></div>)}
      </div>
      {d.team.members.length > 0 && <p className="mt-3 text-xs text-slate-600">Your team: {d.team.members.map((m) => `${m.firstName} (${m.status}${m.languages.length ? `, ${m.languages.join('/').toUpperCase()}` : ''})`).join(' · ')}</p>}
    </section>
  )
}
