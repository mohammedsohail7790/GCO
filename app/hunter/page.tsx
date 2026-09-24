'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatCard } from '@/components/ui/StatCard'
import { StatusPill } from '@/components/ui/StatusPill'

interface Lead {
  id: string
  companyName: string
  contactName: string
  email: string
  pipelineStage: string
  ownershipExpiresAt: string | null
  estimatedValueEurCents: number | null
}

interface HunterDashboard {
  totalLeads: number
  byStage: Record<string, number>
  followUpsDue: Lead[]
  pendingApprovals: number
  commissions: { id: string; amountEurCents: number; status: string; lead: { companyName: string } }[]
  walletEurCents: { pending: number; approved: number; paid: number }
}

const NEXT_STAGE: Record<string, string> = {
  NEW: 'CONTACTED',
  CONTACTED: 'ENGAGED',
  ENGAGED: 'QUALIFIED',
  QUALIFIED: 'MEETING_BOOKED',
  MEETING_BOOKED: 'PROPOSAL',
}

function eur(cents: number) {
  return `€${(cents / 100).toFixed(2)}`
}

export default function HunterPage() {
  const [dashboard, setDashboard] = useState<HunterDashboard | null>(null)
  const [myLeads, setMyLeads] = useState<Lead[]>([])
  const [pool, setPool] = useState<Lead[]>([])
  const [bookingUrl, setBookingUrl] = useState<{ configured: boolean; bookingUrl: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', website: '', vatId: '', estimatedValueEurCents: '' })

  const load = useCallback(() => {
    apiFetch<HunterDashboard>('/crm/dashboard/hunter').then(setDashboard).catch((err) => setError(err.message))
    apiFetch<Lead[]>('/crm/leads').then(setMyLeads).catch(() => {})
    apiFetch<Lead[]>('/crm/leads?unassigned=true').then(setPool).catch(() => {})
    apiFetch<{ configured: boolean; bookingUrl: string | null }>('/crm/calendar/booking-url').then(setBookingUrl).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  async function claim(id: string) {
    try {
      await apiFetch(`/crm/leads/${id}/claim`, { method: 'POST' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim lead')
    }
  }

  async function advanceStage(lead: Lead) {
    const next = NEXT_STAGE[lead.pipelineStage]
    if (!next) return
    try {
      await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: next }) })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change stage')
    }
  }

  async function submitApproval(leadId: string) {
    try {
      await apiFetch(`/crm/leads/${leadId}/submit-approval`, { method: 'POST', body: JSON.stringify({}) })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit for approval')
    }
  }

  async function logFollowUp(leadId: string) {
    const note = window.prompt('What happened? (logs activity and extends the 30-day ownership window)')
    if (!note) return
    try {
      await apiFetch(`/crm/leads/${leadId}/activities`, { method: 'POST', body: JSON.stringify({ note }) })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log activity')
    }
  }

  async function createLead(e: React.FormEvent) {
    e.preventDefault()
    try {
      await apiFetch('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          estimatedValueEurCents: form.estimatedValueEurCents ? Math.round(parseFloat(form.estimatedValueEurCents) * 100) : undefined,
          vatId: form.vatId || undefined,
          website: form.website || undefined,
        }),
      })
      setForm({ companyName: '', contactName: '', email: '', website: '', vatId: '', estimatedValueEurCents: '' })
      setShowNewLead(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lead')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Hunter dashboard</h1>
        </div>
        <button
          onClick={() => setShowNewLead(!showNewLead)}
          className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          + New lead
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {showNewLead && (
        <form onSubmit={createLead} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card sm:grid-cols-2">
          <input required placeholder="Company name" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input required placeholder="Contact name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Website" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="VAT / Tax ID (optional)" value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Estimated deal value (€)" value={form.estimatedValueEurCents} onChange={(e) => setForm({ ...form, estimatedValueEurCents: e.target.value })} className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="col-span-full rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            Create lead
          </button>
        </form>
      )}

      {dashboard && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="My leads" value={dashboard.totalLeads} />
          <StatCard label="Follow-ups due" value={dashboard.followUpsDue.length} accent={dashboard.followUpsDue.length > 0 ? 'warn' : 'good'} />
          <StatCard label="Pending approvals" value={dashboard.pendingApprovals} />
          <StatCard label="Commission (paid)" value={eur(dashboard.walletEurCents.paid)} accent="good" />
        </div>
      )}

      {dashboard && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Commission wallet</p>
          <div className="mt-2 flex gap-6 text-sm">
            <span>Pending: <strong>{eur(dashboard.walletEurCents.pending)}</strong></span>
            <span>Approved: <strong>{eur(dashboard.walletEurCents.approved)}</strong></span>
            <span>Paid: <strong>{eur(dashboard.walletEurCents.paid)}</strong></span>
          </div>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Book closing call</p>
        {bookingUrl?.configured ? (
          <a href={bookingUrl.bookingUrl!} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            Book Closing Call
          </a>
        ) : (
          <p className="mt-2 text-sm italic text-slate-400">Calendar not yet configured — ask an admin to set CALENDLY_SCHEDULING_URL.</p>
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Unassigned pool — claim a lead</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {pool.map((l) => (
            <li key={l.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{l.companyName}</p>
                <p className="text-xs text-slate-500">{l.contactName} · {l.email}</p>
              </div>
              <button onClick={() => claim(l.id)} className="rounded bg-brand-500 px-3 py-1 text-xs font-medium text-white hover:bg-brand-600">
                Claim
              </button>
            </li>
          ))}
          {pool.length === 0 && <li className="p-4 text-sm text-slate-400">No unassigned leads right now.</li>}
        </ul>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">My pipeline</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {myLeads.map((l) => (
            <li key={l.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-slate-900">{l.companyName}</p>
                <p className="text-xs text-slate-500">
                  {l.contactName} · {l.estimatedValueEurCents ? eur(l.estimatedValueEurCents) : 'no estimate'}
                  {l.ownershipExpiresAt && ` · lock expires ${new Date(l.ownershipExpiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={l.pipelineStage} />
                <button onClick={() => logFollowUp(l.id)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                  Log activity
                </button>
                {NEXT_STAGE[l.pipelineStage] && (
                  <button onClick={() => advanceStage(l)} className="rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-900">
                    Move to {NEXT_STAGE[l.pipelineStage]}
                  </button>
                )}
                {l.pipelineStage === 'PROPOSAL' && (
                  <button onClick={() => submitApproval(l.id)} className="rounded bg-brand-500 px-2 py-1 text-xs text-white hover:bg-brand-600">
                    Submit for approval
                  </button>
                )}
              </div>
            </li>
          ))}
          {myLeads.length === 0 && <li className="p-4 text-sm text-slate-400">No leads yet — claim one from the pool above.</li>}
        </ul>
      </div>
    </div>
  )
}
