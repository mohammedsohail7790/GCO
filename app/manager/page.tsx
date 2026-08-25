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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export default function ManagerPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [operators, setOperators] = useState<OperatorRow[]>([])

  const load = useCallback(() => {
    apiFetch<Overview>('/analytics/overview').then(setOverview).catch(() => {})
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
    <div className="min-h-screen p-6">
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Manager dashboard</h1>

      {overview && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Available operators" value={overview.operators.available} />
          <StatCard label="Busy operators" value={overview.operators.busy} />
          <StatCard label="Queue size" value={overview.queueSize} />
          <StatCard label="Active conversations" value={overview.activeConversations} />
          <StatCard label="SLA breaches (24h)" value={overview.slaBreachesLast24h} />
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Operators</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Load</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {operators.map((op) => (
              <tr key={op.id}>
                <td className="px-4 py-2">{op.operatorNumber}</td>
                <td className="px-4 py-2">{op.user.displayName}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{op.status}</span>
                </td>
                <td className="px-4 py-2">{op.activeAssignments} / {op.capacity}</td>
              </tr>
            ))}
            {operators.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">No operators yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
