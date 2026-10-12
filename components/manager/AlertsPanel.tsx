'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Alert { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; count: number }
const STYLE = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
} as const

// Live operational alerts (queue, language coverage, response deadlines, escalations). In-app only: no email is sent.
export function AlertsPanel({ tenantId }: { tenantId?: string } = {}) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const load = useCallback(() => { apiFetch<Alert[]>(`/ops/alerts${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`).then(setAlerts).catch(() => {}) }, [tenantId])
  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])
  if (!alerts) return null
  return (
    <section aria-label="Operational alerts" className="mb-6">
      {alerts.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">All clear — no operational alerts right now.</p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id} role={a.severity === 'critical' ? 'alert' : undefined} className={`rounded-lg border px-4 py-2.5 text-sm ${STYLE[a.severity]}`}>
              <p className="font-semibold">{a.title}</p>
              <p className="text-xs opacity-90">{a.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
