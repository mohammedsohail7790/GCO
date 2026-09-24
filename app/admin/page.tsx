'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill } from '@/components/ui/StatusPill'

interface Tenant {
  id: string
  name: string
  slug: string
  status: string
}

interface SystemHealth {
  database: { healthy: boolean }
  redis: { healthy: boolean }
  queues: Record<string, { waiting: number; active: number; delayed: number; failed: number; completed: number }>
}

interface CeoDashboard {
  totalLeads: number
  closedWonCount: number
  closedLostCount: number
  winRate: number | null
  pipelineValueEurCents: number
  totalRevenueEurCents: number
  mrrEurCents: number
  pendingPayoutEurCents: number
  netMargin:
    | { available: false; reason: string }
    | { available: true; revenueEurCents: number; fulfillmentCostEurCents: number; commissionEurCents: number; netMarginEurCents: number }
  leaderboard: { hunterId: string; displayName: string; amountEurCents: number; dealsWon: number }[]
  awaitingPaymentConfirmation: { id: string; companyName: string; contactName: string }[]
}

interface Approval {
  id: string
  reason: string | null
  createdAt: string
  lead: { id: string; companyName: string; contactName: string }
  submitter: { displayName: string }
}

interface CareerApplication {
  id: string
  fullName: string
  email: string
  phone: string | null
  country: string | null
  languages: string | null
  message: string | null
  createdAt: string
}

function eur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [dashboard, setDashboard] = useState<CeoDashboard | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [applications, setApplications] = useState<CareerApplication[]>([])
  const [error, setError] = useState<string | null>(null)
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [paymentAmount, setPaymentAmount] = useState<Record<string, string>>({})

  function load() {
    apiFetch<Tenant[]>('/admin/tenants')
      .then((d) => {
        setTenants(d)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard data'))
    apiFetch<SystemHealth>('/admin/system-health').then(setHealth).catch(() => {})
    apiFetch<CeoDashboard>('/crm/dashboard/ceo').then(setDashboard).catch(() => {})
    apiFetch<Approval[]>('/crm/approvals').then(setApprovals).catch(() => {})
    apiFetch<CareerApplication[]>('/admin/career-applications').then(setApplications).catch(() => {})
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [])

  async function decide(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    try {
      await apiFetch(`/crm/approvals/${approvalId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision, reviewNotes: decisionNotes[approvalId] }),
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision')
    }
  }

  async function confirmPayment(leadId: string) {
    const amountStr = paymentAmount[leadId]
    const amountEurCents = amountStr ? Math.round(parseFloat(amountStr) * 100) : NaN
    if (!amountStr || Number.isNaN(amountEurCents) || amountEurCents <= 0) {
      setError('Enter the actual first-month amount received before confirming.')
      return
    }
    try {
      await apiFetch(`/crm/leads/${leadId}/confirm-payment`, {
        method: 'POST',
        body: JSON.stringify({ amountEurCents }),
      })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm payment')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
          <span className="text-xs font-bold text-white">G</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Executive dashboard</h1>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      {dashboard && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="MRR" value={eur(dashboard.mrrEurCents)} accent="good" />
            <StatCard label="Total revenue" value={eur(dashboard.totalRevenueEurCents)} />
            <StatCard label="Pending payouts" value={eur(dashboard.pendingPayoutEurCents)} accent="warn" />
            <StatCard label="Pipeline value" value={eur(dashboard.pipelineValueEurCents)} />
            <StatCard label="Closed won" value={dashboard.closedWonCount} accent="good" />
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Net margin</p>
            {dashboard.netMargin.available ? (
              <div className="mt-2 flex flex-wrap gap-6 text-sm">
                <span>Revenue: <strong>{eur(dashboard.netMargin.revenueEurCents)}</strong></span>
                <span>Fulfillment cost: <strong>{eur(dashboard.netMargin.fulfillmentCostEurCents)}</strong></span>
                <span>Commissions: <strong>{eur(dashboard.netMargin.commissionEurCents)}</strong></span>
                <span className="text-slate-900">Net margin: <strong>{eur(dashboard.netMargin.netMarginEurCents)}</strong></span>
              </div>
            ) : (
              <p className="mt-2 text-sm italic text-slate-400">
                Incomplete — {dashboard.netMargin.reason}. Record a fulfillment cost to calculate net margin.
              </p>
            )}
          </div>

          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Hunter leaderboard</h2>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Hunter</th>
                    <th className="px-4 py-2">Deals won</th>
                    <th className="px-4 py-2">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dashboard.leaderboard.map((h) => (
                    <tr key={h.hunterId}>
                      <td className="px-4 py-2 font-medium text-slate-900">{h.displayName}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">{h.dealsWon}</td>
                      <td className="px-4 py-2 tabular-nums text-slate-600">{eur(h.amountEurCents)}</td>
                    </tr>
                  ))}
                  {dashboard.leaderboard.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No commissions yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {approvals.map((a) => (
                  <li key={a.id} className="p-4">
                    <p className="text-sm font-medium text-slate-900">{a.lead.companyName}</p>
                    <p className="text-xs text-slate-500">Submitted by {a.submitter.displayName}</p>
                    {a.reason && <p className="mt-1 text-xs italic text-slate-500">&ldquo;{a.reason}&rdquo;</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        placeholder="Notes"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                        onChange={(e) => setDecisionNotes({ ...decisionNotes, [a.id]: e.target.value })}
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
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

          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Awaiting first payment confirmation</h2>
              <p className="text-xs text-slate-500">
                Closed Won does not create a commission by itself. Confirm the client&apos;s actual first-month
                payment here to generate the Hunter&apos;s 10% commission.
              </p>
            </div>
            <ul className="divide-y divide-slate-100">
              {dashboard.awaitingPaymentConfirmation.map((l) => (
                <li key={l.id} className="p-4">
                  <p className="text-sm font-medium text-slate-900">{l.companyName}</p>
                  <p className="text-xs text-slate-500">{l.contactName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      placeholder="Amount received (€)"
                      className="w-40 rounded border border-slate-300 px-2 py-1 text-xs"
                      onChange={(e) => setPaymentAmount({ ...paymentAmount, [l.id]: e.target.value })}
                    />
                    <button
                      onClick={() => confirmPayment(l.id)}
                      className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600"
                    >
                      Confirm payment received
                    </button>
                  </div>
                </li>
              ))}
              {dashboard.awaitingPaymentConfirmation.length === 0 && (
                <li className="p-4 text-sm text-slate-400">No Closed Won deals awaiting payment confirmation.</li>
              )}
            </ul>
          </div>
        </>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold text-slate-900">System health</h2>
          {health ? (
            <div className="space-y-1 text-sm">
              <p>Database: <span className={health.database.healthy ? 'text-emerald-600' : 'text-red-600'}>{health.database.healthy ? 'healthy' : 'down'}</span></p>
              <p>Redis: <span className={health.redis.healthy ? 'text-emerald-600' : 'text-red-600'}>{health.redis.healthy ? 'healthy' : 'down'}</span></p>
              <p>Dead-letter jobs: {health.queues.deadLetter?.waiting ?? 0}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Tenants</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2">{t.name}</td>
                <td className="px-4 py-2 text-slate-500">{t.slug}</td>
                <td className="px-4 py-2">
                  <StatusPill status={t.status} />
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No tenants yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Career applications</h2>
          <p className="text-xs text-slate-500">Submissions from the public /careers page. No review workflow yet - shown here for visibility.</p>
        </div>
        <ul className="divide-y divide-slate-100">
          {applications.map((a) => (
            <li key={a.id} className="p-4 text-sm">
              <p className="font-medium text-slate-900">{a.fullName} <span className="font-normal text-slate-500">— {a.email}</span></p>
              <p className="mt-0.5 text-xs text-slate-500">
                {[a.country, a.languages, a.phone].filter(Boolean).join(' · ') || 'No additional details'}
              </p>
              {a.message && <p className="mt-1 text-xs italic text-slate-500">&ldquo;{a.message}&rdquo;</p>}
            </li>
          ))}
          {applications.length === 0 && <li className="p-4 text-sm text-slate-400">No applications yet.</li>}
        </ul>
      </div>
    </div>
  )
}
