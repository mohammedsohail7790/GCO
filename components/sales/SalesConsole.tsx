'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { DiscoveryPanel, type DiscoveryState } from './DiscoveryPanel'

interface Unavailable { available: false; reason: string }
interface Funnel {
  leads: { total: number; owned: number; unassigned: number; byStage: Record<string, number> }
  qualification: Record<string, number>
  discovery: { meetingStage: number; callsHeld: Unavailable }
  proposals: number
  pendingApproval: number
  closedWon: number
  closedLost: number
  followUps: { dueCount: number; items: { leadId: string; companyName: string; stage: string; ownerName: string | null; nextAction: string | null; nextActionAt: string | null; daysSinceContact: number | null; reason: string }[] }
  onboarding: { byStatus: Record<string, number>; inProgress: number; live: number }
  calendlyBookings: Unavailable
  finance: null | { totalRevenueEurCents: number; firstMonthRevenueEurCents: number; commissionPendingEurCents: number; commissionApprovedEurCents: number; commissionPaidEurCents: number }
}
interface LeadRow extends DiscoveryState {
  id: string
  companyName: string
  contactName: string
  email: string
  source: string | null
  pipelineStage: string
  owner: { displayName: string } | null
  daysSinceContact: number | null
}

const eur = (c: number) => `€${(c / 100).toFixed(2)}`
const QUAL: Record<string, string> = { QUALIFIED: 'Qualified', NOT_QUALIFIED: 'Not qualified', NEEDS_FOLLOW_UP: 'Needs follow-up' }
const SOURCES = [['calendly_booking', 'Calendly booking'], ['referral', 'Referral'], ['outbound', 'Outbound'], ['website_manual', 'Website (manual)'], ['other', 'Other']]

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>}
    </div>
  )
}

/** Sales operations for the CEO / Manager: funnel, follow-ups, every lead with its discovery record, add-lead, and (CEO) a Hunter login. */
export function SalesConsole({ canCreateHunters = false }: { canCreateHunters?: boolean }) {
  const [funnel, setFunnel] = useState<Funnel | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Funnel>('/crm/dashboard/funnel').then(setFunnel).catch(() => {})
    apiFetch<LeadRow[]>('/crm/leads?pageSize=100').then(setLeads).catch(() => {})
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function addLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setError(null)
    setMsg(null)
    try {
      const r = await apiFetch<{ domainWarning: string | null }>('/crm/leads', {
        method: 'POST',
        body: JSON.stringify({ companyName: String(f.get('companyName')), contactName: String(f.get('contactName')), email: String(f.get('email')), website: String(f.get('website') || '') || undefined, source: String(f.get('source')) }),
      })
      form.reset()
      setMsg(`Lead added to the unassigned pool - a Hunter claims it to work it.${r.domainWarning ? ` Note: ${r.domainWarning}` : ''}`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the lead')
    }
  }

  async function addHunter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setError(null)
    setMsg(null)
    try {
      await apiFetch('/admin/users', { method: 'POST', body: JSON.stringify({ role: 'HUNTER', displayName: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')) }) })
      form.reset()
      setMsg('Hunter login created. Share the one-time password securely; the Hunter signs in at /hunter.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the login')
    }
  }

  const input = 'rounded border border-slate-300 px-2 py-1.5 text-sm'
  return (
    <section className="mb-8 space-y-4" aria-labelledby="sales-heading">
      <h2 id="sales-heading" className="text-lg font-semibold tracking-tight text-slate-900">Sales funnel</h2>
      {funnel && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Leads" value={funnel.leads.total} note={`${funnel.leads.owned} owned · ${funnel.leads.unassigned} unassigned`} />
            <Stat label="Qualified" value={funnel.qualification.QUALIFIED ?? 0} note={`${funnel.qualification.NEEDS_FOLLOW_UP ?? 0} need follow-up · ${funnel.qualification.UNASSESSED ?? 0} not assessed`} />
            <Stat label="Discovery stage" value={funnel.discovery.meetingStage} note="leads at Meeting booked" />
            <Stat label="Proposals" value={funnel.proposals} note={`${funnel.pendingApproval} awaiting approval`} />
            <Stat label="Closed won" value={funnel.closedWon} note={`${funnel.closedLost} lost`} />
            <Stat label="Follow-ups due" value={funnel.followUps.dueCount} />
            <Stat label="Onboarding" value={funnel.onboarding.inProgress} note="clients being onboarded" />
            <Stat label="Live clients" value={funnel.onboarding.live} />
            {funnel.finance && <Stat label="First-month revenue" value={eur(funnel.finance.firstMonthRevenueEurCents)} note={`all revenue ${eur(funnel.finance.totalRevenueEurCents)}`} />}
            {funnel.finance && <Stat label="Commission pending" value={eur(funnel.finance.commissionPendingEurCents)} note={`${eur(funnel.finance.commissionApprovedEurCents)} approved`} />}
          </div>
          <p className="text-[11px] text-slate-500">
            Not tracked: calls held - {funnel.discovery.callsHeld.reason} · Calendly bookings - {funnel.calendlyBookings.reason}
          </p>
          {funnel.followUps.items.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60">
              <p className="border-b border-amber-200 px-4 py-2 text-sm font-semibold text-amber-900">Follow-ups due</p>
              <ul className="divide-y divide-amber-100 text-sm">
                {funnel.followUps.items.map((f) => (
                  <li key={f.leadId} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                    <span className="font-medium text-slate-900">{f.companyName} <span className="font-normal text-slate-500">· {f.stage.replaceAll('_', ' ').toLowerCase()} · {f.ownerName ?? 'unassigned'}</span></span>
                    <span className="text-xs text-slate-600">{f.reason === 'next_action_due' ? `${f.nextAction ?? 'Next action'} · due ${f.nextActionAt ? new Date(f.nextActionAt).toLocaleDateString() : ''}` : 'lock expiring'}{f.daysSinceContact !== null && ` · ${f.daysSinceContact} d since contact`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {msg && <p role="status" className="text-xs text-emerald-700">{msg}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <details className="rounded-lg border border-slate-200 bg-white">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-800">Add a lead (for example after a Calendly booking)</summary>
        <form onSubmit={addLead} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-2">
          <input name="companyName" required maxLength={200} placeholder="Company" aria-label="Company" className={input} />
          <input name="contactName" required maxLength={200} placeholder="Contact name" aria-label="Contact name" className={input} />
          <input name="email" type="email" required placeholder="Contact email" aria-label="Contact email" className={input} />
          <input name="website" maxLength={300} placeholder="Website (optional)" aria-label="Website" className={input} />
          <select name="source" defaultValue="calendly_booking" aria-label="Source" className={input}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white sm:justify-self-start">Add lead</button>
          <p className="text-[11px] text-slate-500 sm:col-span-2">Duplicates are blocked by email and tax ID; a matching website domain only shows a warning. Nothing is sent to the prospect.</p>
        </form>
      </details>

      {canCreateHunters && (
        <details className="rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-800">Add a Hunter login (sales team member)</summary>
          <form onSubmit={addHunter} className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-3">
            <input name="name" required maxLength={120} placeholder="Name" aria-label="Hunter name" className={input} />
            <input name="email" type="email" required placeholder="Email" aria-label="Hunter email" className={input} />
            <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="One-time password (10+)" aria-label="One-time password" className={input} />
            <button className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white sm:justify-self-start">Create Hunter</button>
            <p className="text-[11px] text-slate-500 sm:col-span-3">A Hunter owns leads, submits Closed Won for approval, and earns the universal 10% first-month commission after payment. The person who submits a deal cannot approve it.</p>
          </form>
        </details>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <p className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">All leads ({leads.length})</p>
        <ul className="divide-y divide-slate-100">
          {leads.map((l) => (
            <li key={l.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{l.companyName} <span className="font-normal text-slate-500">· {l.contactName}</span></p>
                  <p className="text-xs text-slate-500">
                    {l.pipelineStage.replaceAll('_', ' ').toLowerCase()} · owner {l.owner?.displayName ?? 'unassigned'} · source {l.source?.replaceAll('_', ' ') ?? 'unknown'} · {l.qualification ? QUAL[l.qualification] : 'not assessed'}
                    {l.daysSinceContact !== null && ` · ${l.daysSinceContact} d since contact`}
                    {l.nextAction && ` · next: ${l.nextAction}${l.nextActionAt ? ` (${new Date(l.nextActionAt).toLocaleDateString()})` : ''}`}
                  </p>
                </div>
                <button onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id} className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">Discovery</button>
              </div>
              {open === l.id && <DiscoveryPanel leadId={l.id} initial={{ qualification: l.qualification ?? null, discovery: l.discovery ?? null, nextAction: l.nextAction ?? null, nextActionAt: l.nextActionAt ?? null }} onSaved={load} />}
            </li>
          ))}
          {leads.length === 0 && <li className="p-4 text-sm text-slate-400">No leads yet.</li>}
        </ul>
      </div>
    </section>
  )
}
