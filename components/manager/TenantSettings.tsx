'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { DAYS, type OperatingHours } from '@/lib/tenant/settings'

interface Settings { tenantId: string; name: string; responseSlaSeconds: number; operatorCapacity: number; timezone: string; operatingHours: OperatingHours | null }
const LABEL: Record<string, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }
const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** Per-client service settings. `editable` is only offered to CEO/assistant screens; the API enforces it regardless. */
export function TenantSettings({ tenantId, editable }: { tenantId?: string; editable: boolean }) {
  const [s, setS] = useState<Settings | null>(null)
  const [hours, setHours] = useState<OperatingHours | null>(null)
  const [always, setAlways] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = useCallback(() => {
    apiFetch<Settings>(`/tenant/settings${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`)
      .then((d) => { setS(d); setHours(d.operatingHours); setAlways(!d.operatingHours || Object.keys(d.operatingHours).length === 0); setError(null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [tenantId])
  useEffect(() => { load() }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!s) return
    setSaved(false)
    try {
      await apiFetch('/tenant/settings', { method: 'PATCH', body: JSON.stringify({ tenantId: s.tenantId, responseSlaSeconds: s.responseSlaSeconds, operatorCapacity: s.operatorCapacity, timezone: s.timezone, operatingHours: always ? null : hours ?? {} }) })
      setSaved(true); setError(null); load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
  }
  if (!s) return error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null
  const dis = !editable
  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="ts-title">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 id="ts-title" className="text-sm font-semibold text-slate-900">Service settings{editable ? '' : ' (read-only)'} — {s.name}</h2>
        <p className="text-xs text-slate-500">Operating hours are informational: they affect alerts, not routing.{editable ? '' : ' Ask the CEO to change these.'}</p>
      </div>
      <form onSubmit={save} className="space-y-4 p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600">Response deadline (seconds)
            <input disabled={dis} type="number" min={30} max={3600} value={s.responseSlaSeconds} onChange={(e) => setS({ ...s, responseSlaSeconds: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </label>
          <label className="block text-xs font-medium text-slate-600">Default operator capacity
            <input disabled={dis} type="number" min={1} max={20} value={s.operatorCapacity} onChange={(e) => setS({ ...s, operatorCapacity: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </label>
          <label className="block text-xs font-medium text-slate-600">Timezone
            <input disabled={dis} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </label>
        </div>
        <fieldset>
          <legend className="text-xs font-medium text-slate-600">Operating hours</legend>
          <label className="mt-1 flex items-center gap-2 text-xs"><input disabled={dis} type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Open 24/7</label>
          {!always && (
            <ul className="mt-2 space-y-1">
              {ORDER.filter((d) => (DAYS as readonly string[]).includes(d)).map((d) => {
                const h = hours?.[d]
                return (
                  <li key={d} className="flex items-center gap-2 text-xs">
                    <label className="flex w-28 items-center gap-1.5"><input disabled={dis} type="checkbox" checked={!!h} onChange={(e) => setHours({ ...(hours ?? {}), [d]: e.target.checked ? { open: '09:00', close: '17:00' } : undefined })} />{LABEL[d]}</label>
                    {h ? (<><input disabled={dis} aria-label={`${LABEL[d]} opens`} type="time" value={h.open} onChange={(e) => setHours({ ...(hours ?? {}), [d]: { ...h, open: e.target.value } })} className="rounded border border-slate-200 px-1 py-0.5" />–<input disabled={dis} aria-label={`${LABEL[d]} closes`} type="time" value={h.close} onChange={(e) => setHours({ ...(hours ?? {}), [d]: { ...h, close: e.target.value } })} className="rounded border border-slate-200 px-1 py-0.5" /></>) : <span className="text-slate-400">Closed</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </fieldset>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        {saved && <p role="status" className="text-xs text-emerald-700">Saved.</p>}
        {editable && <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Save settings</button>}
      </form>
    </section>
  )
}
