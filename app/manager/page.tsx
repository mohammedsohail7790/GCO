'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useRealtime } from '@/lib/realtime/useRealtime'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill } from '@/components/ui/StatusPill'

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

interface ManagerCrmDashboard {
  totalLeads: number
  byStage: Record<string, number>
  pendingApprovals: number
  teamCommissionEurCents: number
}

interface Approval {
  id: string
  reason: string | null
  lead: { id: string; companyName: string; contactName: string }
  submitter: { displayName: string }
}

function eur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

export default function ManagerPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [operators, setOperators] = useState<OperatorRow[]>([])
  const [crm, setCrm] = useState<ManagerCrmDashboard | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Overview>('/analytics/overview')
      .then((d) => {
        setOverview(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard data'))
    apiFetch<OperatorRow[]>('/operators').then(setOperators).catch(() => {})
    apiFetch<ManagerCrmDashboard>('/crm/dashboard/manager').then(setCrm).catch(() => {})
    apiFetch<Approval[]>('/crm/approvals').then(setApprovals).catch(() => {})
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

  async function decide(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    try {
      await apiFetch(`/crm/approvals/${approvalId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision')
    }
  }

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

      {/* Sales CRM - team visibility. Financial figures beyond team commission
          totals (MRR, net margin, payout control) remain CEO-only, per RBAC. */}
      <div className="mt-8 mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
          <span className="text-xs font-bold text-white">G</span>
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Sales CRM — team</h2>
      </div>

      {crm && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total leads" value={crm.totalLeads} />
          <StatCard label="Pending approvals" value={crm.pendingApprovals} accent={crm.pendingApprovals > 0 ? 'warn' : 'good'} />
          <StatCard label="Team commission" value={eur(crm.teamCommissionEurCents)} />
          <StatCard label="Closed won" value={crm.byStage['CLOSED_WON'] ?? 0} accent="good" />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {approvals.map((a) => (
            <li key={a.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{a.lead.companyName}</p>
                <p className="text-xs text-slate-500">Submitted by {a.submitter.displayName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide(a.id, 'APPROVED')}
                  className="rounded bg-emerald-500 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide(a.id, 'REJECTED')}
                  className="rounded bg-red-500 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
          {approvals.length === 0 && <li className="p-4 text-sm text-slate-400">No pending approvals.</li>}
        </ul>
      </div>
    </div>
  )
}
