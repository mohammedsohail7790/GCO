'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface N { id: string; type: string; payload: Record<string, unknown>; readAt: string | null; createdAt: string }

function label(n: N) {
  const p = n.payload as { title?: string; subject?: string; status?: string; severity?: string }
  if (n.type.startsWith('alert:')) return `${p.severity === 'critical' ? 'Critical: ' : ''}${p.title ?? 'Alert'}`
  if (n.type === 'client_request') return `New client request: ${p.subject ?? ''}`
  if (n.type === 'client_request_reply') return `Client replied: ${p.subject ?? ''}`
  if (n.type === 'gco_reply') return `Reply from your GCO team: ${p.subject ?? ''}`
  if (n.type === 'client_request_status') return `Request "${p.subject ?? ''}" is now ${String(p.status ?? '').toLowerCase().replace('_', ' ')}`
  return n.type
}

/** In-app notifications for the signed-in user (alerts routed to their role, client requests and replies). */
export function NotificationBell() {
  const [data, setData] = useState<{ unread: number; notifications: N[] } | null>(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => apiFetch<{ unread: number; notifications: N[] }>('/notifications').then(setData).catch(() => {}), [])
  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id) }, [load])
  return (
    <span className="relative">
      <button onClick={() => { setOpen(!open); if (!open && data?.unread) apiFetch('/notifications/read', { method: 'POST', body: '{}' }).then(load).catch(() => {}) }} aria-label="Notifications" className="relative rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
        Notifications{data && data.unread > 0 && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{data.unread}</span>}
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-1 max-h-80 w-80 overflow-auto rounded-lg border border-slate-200 bg-white text-sm shadow-panel">
          {data?.notifications.length ? data.notifications.map((n) => <li key={n.id} className="border-b border-slate-100 px-3 py-2 last:border-0"><span className={n.readAt ? 'text-slate-500' : 'font-medium text-slate-900'}>{label(n)}</span><br /><span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('en-GB')}</span></li>) : <li className="px-3 py-3 text-slate-400">Nothing yet.</li>}
        </ul>
      )}
    </span>
  )
}
