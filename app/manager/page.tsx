'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useRealtime } from '@/lib/realtime/useRealtime'

interface Overview {
  operators: { available: number; busy: number; offline: number; paused: number }
  queueSize: number
  activeConversations: number
  slaBreachesLast24h: number
  avgResponseSecondsLast24h: number | null
}

interface OperatorRow {
  id: string
  operatorNumber: number
  status: string
  capacity: number
  activeAssignments: number
  user: { displayName: string; email: string }
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: 'good' | 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums ${
          accent === 'warn' ? 'text-amber-600' : accent === 'good' ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    BUSY: 'bg-amber-100 text-amber-700',
    PAUSED: 'bg-slate-100 text-slate-600',
    OFFLINE: 'bg-slate-100 text-slate-400',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>{status}</span>
}

export default function ManagerPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [operators, setOperators] = useState<OperatorRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Overview>('/analytics/overview')
      .then((d) => {
        setOverview(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard data'))
    apiFetch<OperatorRow[]>('/operators').then(setOperators).catch(() => {})
  }, [])

  useEffect(() => {
    // Unconditional polling fallback - keeps running regardless of WebSocket
    // connectivity (see useRealtime below); the database stays authoritative.
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  // Accelerator only: nudges an immediate refetch on a push event, never
  // trusted as data on its own.
  useRealtime(load, true)

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
          <span className="text-xs font-bold text-white">G</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Manager dashboard</h1>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {overview && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Available operators" value={overview.operators.available} accent="good" />
          <StatCard label="Busy operators" value={overview.operators.busy} />
          <StatCard label="Queue size" value={overview.queueSize} />
          <StatCard label="Active conversations" value={overview.activeConversations} />
          <StatCard
            label="SLA breaches (24h)"
            value={overview.slaBreachesLast24h}
            accent={overview.slaBreachesLast24h > 0 ? 'warn' : 'good'}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Operators</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">#</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Load</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {operators.map((op) => (
              <tr key={op.id} className="transition hover:bg-slate-50">
                <td className="px-4 py-2.5 tabular-nums text-slate-500">{op.operatorNumber}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{op.user.displayName}</td>
                <td className="px-4 py-2.5">
                  <StatusPill status={op.status} />
                </td>
                <td className="px-4 py-2.5 tabular-nums text-slate-600">
                  {op.activeAssignments} / {op.capacity}
                </td>
              </tr>
            ))}
            {operators.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No operators yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
