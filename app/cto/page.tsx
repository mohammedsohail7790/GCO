'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatCard } from '@/components/ui/StatCard'

interface Health {
  database: { healthy: boolean }
  redis: { healthy: boolean }
  queues: Record<string, { waiting: number; active: number; delayed: number; failed: number; completed: number }>
  recentErrors: { id: string; severity: string; type?: string; message?: string; createdAt: string }[]
}
interface AuditRow { id: string; action: string; resource: string; resourceId: string | null; actorUserId: string | null; createdAt: string; tenantId: string | null }

// Technical operations view for the CTO: platform health, queues and the audit trail. No client, revenue or earnings data.
export default function CtoPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Health>('/admin/system-health').then(setHealth).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load health'))
    apiFetch<AuditRow[]>('/admin/audit-logs?pageSize=50').then(setAudit).catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Technical operations</h1>
        <a href="/account" className="ml-auto text-sm font-medium text-brand-600 hover:underline">Account</a>
      </div>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {health && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Database" value={health.database.healthy ? 'Healthy' : 'DOWN'} accent={health.database.healthy ? 'good' : 'warn'} />
            <StatCard label="Redis" value={health.redis.healthy ? 'Healthy' : 'DOWN'} accent={health.redis.healthy ? 'good' : 'warn'} />
            <StatCard label="Failed jobs" value={Object.values(health.queues).reduce((a, q) => a + q.failed, 0)} accent={Object.values(health.queues).some((q) => q.failed > 0) ? 'warn' : 'good'} />
            <StatCard label="Recent errors" value={health.recentErrors.length} accent={health.recentErrors.length > 0 ? 'warn' : 'good'} />
          </div>
          <div className="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Queue</th><th>Waiting</th><th>Active</th><th>Delayed</th><th>Failed</th></tr></thead>
              <tbody>
                {Object.entries(health.queues).map(([name, q]) => (
                  <tr key={name} className="border-t border-slate-100"><td className="px-4 py-2 font-medium text-slate-900">{name}</td><td>{q.waiting}</td><td>{q.active}</td><td>{q.delayed}</td><td className={q.failed > 0 ? 'font-semibold text-red-600' : ''}>{q.failed}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Audit log (latest 50)</h2></div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">When</th><th>Action</th><th>Resource</th><th>Actor</th></tr></thead>
          <tbody>
            {audit.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No entries.</td></tr>}
            {audit.map((a) => (
              <tr key={a.id} className="border-t border-slate-100"><td className="px-4 py-1.5">{new Date(a.createdAt).toLocaleString('en-GB')}</td><td>{a.action}</td><td>{a.resource}{a.resourceId ? ` · ${a.resourceId.slice(-6)}` : ''}</td><td>{a.actorUserId ? a.actorUserId.slice(-6) : '-'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
