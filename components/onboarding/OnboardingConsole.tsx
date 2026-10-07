'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Row { id: string; status: string; contactEmail: string; lastError: string | null; tenant: { name: string; slug: string } }
interface Detail {
  id: string
  status: string
  ready: boolean
  tenant: { id: string; name: string; defaultOperatorCapacity: number; defaultResponseSlaSeconds: number }
  contact: { name: string; email: string }
  invitation: { pending: boolean; expiresAt: string | null; accepted: boolean }
  requestedProfile: { services?: string[]; languages?: string[]; coverage?: string | null; volume?: string | null }
  checklist: { key: string; label: string; done: boolean; source: 'system' | 'manual'; state: 'pass' | 'fail' | 'blocked'; detail?: string }[]
  lastError: string | null
  manual: boolean
  clientProfile: Record<string, string>
  integrations: {
    id: string; name: string; adapter: string; status: string; productionCapable: boolean; usableForGoLive: boolean
    callbackUrl: string | null; webhookPath: string; verification: { outboundAt: string | null; inboundAt: string | null }; verified: boolean
  }[]
  operators: { id: string; name: string; email: string; active: boolean; status: string; capacity: number }[]
}

const PROFILE_FIELDS: { key: 'channel' | 'website' | 'operatingHours' | 'technicalContact' | 'escalationContact'; label: string; placeholder: string }[] = [
  { key: 'channel', label: 'Channel', placeholder: 'e.g. the client\'s in-app chat' },
  { key: 'website', label: 'Website', placeholder: 'client.example.com' },
  { key: 'operatingHours', label: 'Operating hours', placeholder: 'e.g. Mon-Fri 09:00-18:00 CET' },
  { key: 'technicalContact', label: 'Technical contact', placeholder: 'name, email' },
  { key: 'escalationContact', label: 'Escalation contact', placeholder: 'name, email' },
]

const MANUAL: Record<string, 'languages' | 'coverage' | 'supervisor'> = {
  languages_confirmed: 'languages',
  coverage_confirmed: 'coverage',
  supervisor_confirmed: 'supervisor',
}

const PILL: Record<string, string> = {
  PROVISIONING: 'bg-slate-100 text-slate-700',
  FAILED: 'bg-red-100 text-red-700',
  SETUP: 'bg-amber-100 text-amber-800',
  READY_FOR_GO_LIVE: 'bg-blue-100 text-blue-800',
  LIVE: 'bg-emerald-100 text-emerald-800',
}

function ClientPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Detail>(`/admin/onboarding/${id}`).then(setDetail).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [id])
  useEffect(() => {
    load()
  }, [load])

  async function act(path: string, body?: unknown, okMsg?: string) {
    setError(null)
    setMsg(null)
    try {
      const r = await apiFetch<{ setupUrl?: string }>(`/admin/onboarding/${id}/${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) })
      if (r?.setupUrl) setLink(r.setupUrl)
      if (okMsg) setMsg(okMsg)
      load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    }
  }

  if (!detail) return <p className="text-slate-400">{error ?? 'Loading…'}</p>
  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-slate-900">{detail.tenant.name}</p>
        <p className="break-all text-xs text-slate-500">{detail.contact.email} · default SLA {detail.tenant.defaultResponseSlaSeconds}s · {detail.tenant.defaultOperatorCapacity} concurrent per operator</p>
        <p className="mt-1 text-xs text-slate-500">
          Requested in pilot form: {[...(detail.requestedProfile.services ?? []), ...(detail.requestedProfile.languages ?? []), detail.requestedProfile.coverage, detail.requestedProfile.volume].filter(Boolean).join(' · ') || 'nothing structured'} (starting point only - confirm below)
        </p>
      </div>
      {detail.lastError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">Provisioning problem: {detail.lastError}</p>}
      <ul className="space-y-2">
        {detail.checklist.map((i) => (
          <li key={i.key} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex min-w-[3.25rem] justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  i.state === 'pass' ? 'bg-emerald-100 text-emerald-800' : i.state === 'blocked' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
                }`}
              >
                {i.state === 'pass' ? 'Pass' : i.state === 'blocked' ? 'Blocked' : 'Fail'}
              </span>
              <span className={i.done ? 'text-slate-700' : 'text-slate-900'}>{i.label}</span>
              {!i.done && MANUAL[i.key] && (
                <button onClick={() => act('confirm', { item: MANUAL[i.key] }, 'Confirmed')} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">Confirm</button>
              )}
            </div>
            {!i.done && i.detail && <p className="ml-[3.9rem] mt-0.5 text-xs text-slate-500">{i.detail}</p>}
          </li>
        ))}
      </ul>
      {!detail.ready && detail.status !== 'LIVE' && (
        <div role="note" className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <strong>Go Live is blocked</strong> by {detail.checklist.filter((i) => !i.done).length} item(s):{' '}
          {detail.checklist.filter((i) => !i.done).map((i) => i.label).join('; ')}.
          {detail.checklist.some((i) => i.state === 'blocked') && ' Items marked Blocked are waiting on the client.'}
        </div>
      )}
      <section aria-label="Integrations for this client" className="space-y-2 rounded border border-slate-200 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Integration</h3>
        {detail.integrations.length === 0 ? (
          <p className="text-xs text-slate-500">None yet. Create a staged integration in &quot;Client integrations&quot; below, choosing this client.</p>
        ) : (
          detail.integrations.map((i) => (
            <div key={i.id} className="text-xs text-slate-700">
              <p><span className="font-medium">{i.name}</span> · {i.adapter} · {i.status} · {i.productionCapable ? 'production-capable' : 'development only (cannot go live)'}</p>
              <p className="break-all text-slate-500">{i.callbackUrl ? `Callback: ${i.callbackUrl}` : 'No callback URL'} · Outbound test: {i.verification.outboundAt ? 'passed' : 'not run'} · Client ping: {i.verification.inboundAt ? 'received' : 'not received'} · {i.verified ? 'verified' : 'not verified'}</p>
            </div>
          ))
        )}
      </section>

      <section aria-label="Operators for this client" className="space-y-2 rounded border border-slate-200 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operators</h3>
        {detail.operators.length === 0 ? <p className="text-xs text-slate-500">No operator yet.</p> : detail.operators.map((o) => <p key={o.id} className="text-xs text-slate-700">{o.name} · {o.email} · {o.active ? o.status : 'inactive'}</p>)}
        <form
          className="grid gap-2 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setError(null)
            try {
              await apiFetch('/admin/users', {
                method: 'POST',
                body: JSON.stringify({ role: 'OPERATOR', tenantId: detail.tenant.id, displayName: String(f.get('name')), email: String(f.get('email')), password: String(f.get('password')) }),
              })
              ;(e.target as HTMLFormElement).reset()
              setMsg('Operator created. Share the one-time password securely; the operator signs in and sets themselves AVAILABLE.')
              load()
              onChanged()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create the operator (only the CEO can create logins)')
            }
          }}
        >
          <input name="name" required maxLength={120} placeholder="Operator name" aria-label="Operator name" className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <input name="email" type="email" required placeholder="Email" aria-label="Operator email" className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="One-time password (10+)" aria-label="One-time password" className="rounded border border-slate-300 px-2 py-1 text-xs" />
          <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 sm:col-span-3 sm:justify-self-start">Add operator (CEO)</button>
        </form>
      </section>

      <section aria-label="Client profile" className="space-y-2 rounded border border-slate-200 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client profile (non-secret)</h3>
        <p className="text-[11px] text-slate-500">Never enter API keys, passwords, tokens or secrets here - they are refused. Secrets go through the integration secret only.</p>
        <form
          key={JSON.stringify(detail.clientProfile)}
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            setError(null)
            try {
              await apiFetch(`/admin/onboarding/${id}/profile`, { method: 'POST', body: JSON.stringify(Object.fromEntries(PROFILE_FIELDS.map((p) => [p.key, String(f.get(p.key) ?? '')]))) })
              setMsg('Profile saved')
              load()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not save the profile')
            }
          }}
        >
          {PROFILE_FIELDS.map((p) => (
            <label key={p.key} className="text-[11px] font-medium text-slate-600">
              {p.label}
              <input name={p.key} defaultValue={detail.clientProfile[p.key] ?? ''} maxLength={200} placeholder={p.placeholder} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal" />
            </label>
          ))}
          <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 sm:col-span-2 sm:justify-self-start">Save profile</button>
        </form>
      </section>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => act('retry', {}, 'Provisioning re-queued')} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Retry provisioning</button>
        {!detail.invitation.accepted && (
          <button onClick={() => act('invitation', {})} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            {detail.invitation.pending ? 'Re-issue setup link' : 'Create setup link'}
          </button>
        )}
        <button
          disabled={!detail.ready || detail.status === 'LIVE'}
          onClick={() => act('go-live', {}, 'Client is live')}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {detail.status === 'LIVE' ? 'Live' : 'Go live'}
        </button>
      </div>
      {link && (
        <div className="rounded border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">One-time setup link - copy it now, it will not be shown again. Send it to the client contact yourself.</p>
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="One-time setup link" className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs" />
        </div>
      )}
      {msg && <p role="status" className="text-xs text-emerald-700">{msg}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

/** For a client that did not come through the CRM pipeline: creates the tenant and the inactive client user (audited, no lead/commission). */
function StartOnboardingForm({ onStarted }: { onStarted: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open) {
    return (
      <div className="border-b border-slate-100 px-4 py-3">
        <button onClick={() => setOpen(true)} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Start onboarding for a new client</button>
        <span className="ml-2 text-xs text-slate-500">Clients closed through the CRM appear here automatically.</span>
      </div>
    )
  }
  return (
    <form
      className="grid gap-2 border-b border-slate-100 px-4 py-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const name = String(f.get('name'))
        setBusy(true)
        setError(null)
        try {
          const r = await apiFetch<{ id: string }>('/admin/onboarding', {
            method: 'POST',
            body: JSON.stringify({ name, slug: String(f.get('slug') || slugify(name)), contactName: String(f.get('contactName')), contactEmail: String(f.get('contactEmail')) }),
          })
          setOpen(false)
          onStarted(r.id)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not start onboarding')
        } finally {
          setBusy(false)
        }
      }}
    >
      <input name="name" required maxLength={200} placeholder="Company name" aria-label="Company name" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      <input name="slug" maxLength={80} pattern="[a-z0-9\-]+" placeholder="url-slug (optional, from the name)" aria-label="Slug" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      <input name="contactName" required maxLength={120} placeholder="Client contact name" aria-label="Client contact name" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      <input name="contactEmail" type="email" required placeholder="Client contact email" aria-label="Client contact email" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
      {error && <p role="alert" className="text-xs text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create client + login'}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700">Cancel</button>
      </div>
    </form>
  )
}

/** Client onboarding console (CEO / Assistant). Setup links are shown once and never persisted client-side beyond this view. */
export function OnboardingConsole() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const loadList = useCallback(() => {
    apiFetch<Row[]>('/admin/onboarding').then(setRows).catch(() => setRows([]))
  }, [])
  useEffect(() => {
    loadList()
  }, [loadList])

  return (
    <section className="mb-8 rounded-lg border border-slate-200 bg-white" aria-labelledby="onboarding-heading">
      <div className="border-b border-slate-200 p-4">
        <h2 id="onboarding-heading" className="font-semibold text-slate-900">Client onboarding</h2>
        <p className="mt-0.5 text-xs text-slate-500">Closed Won clients move from handoff to go-live here. Nothing goes live until you press Go live.</p>
      </div>
      <StartOnboardingForm onStarted={(id) => { loadList(); setSelected(id) }} />
      {rows === null ? (
        <p className="p-4 text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">No clients are being onboarded.</p>
      ) : (
        <div className="grid gap-0 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
          <ul className="divide-y divide-slate-100 border-b border-slate-200 md:border-b-0 md:border-r">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  aria-current={selected === r.id}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm hover:bg-slate-50 ${selected === r.id ? 'bg-slate-50' : ''}`}
                >
                  <span className="min-w-0 truncate font-medium text-slate-900">{r.tenant.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[r.status] ?? PILL.PROVISIONING}`}>{r.status.replaceAll('_', ' ')}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 p-4 text-sm">
            {selected ? <ClientPanel key={selected} id={selected} onChanged={loadList} /> : <p className="text-slate-400">Select a client.</p>}
          </div>
        </div>
      )}
    </section>
  )
}
