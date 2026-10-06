'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Row { id: string; status: string; contactEmail: string; lastError: string | null; tenant: { name: string; slug: string } }
interface Detail {
  id: string
  status: string
  ready: boolean
  tenant: { name: string; defaultOperatorCapacity: number; defaultResponseSlaSeconds: number }
  contact: { name: string; email: string }
  invitation: { pending: boolean; expiresAt: string | null; accepted: boolean }
  requestedProfile: { services?: string[]; languages?: string[]; coverage?: string | null; volume?: string | null }
  checklist: { key: string; label: string; done: boolean; source: 'system' | 'manual' }[]
  lastError: string | null
}

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
      <ul className="space-y-1.5">
        {detail.checklist.map((i) => (
          <li key={i.key} className="flex flex-wrap items-center gap-2">
            <span aria-hidden className={i.done ? 'text-emerald-600' : 'text-slate-300'}>{i.done ? '✓' : '○'}</span>
            <span className={i.done ? 'text-slate-700' : 'text-slate-900'}>{i.label}</span>
            <span className="sr-only">{i.done ? 'done' : 'not done'}</span>
            {!i.done && MANUAL[i.key] && (
              <button onClick={() => act('confirm', { item: MANUAL[i.key] }, 'Confirmed')} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">Confirm</button>
            )}
          </li>
        ))}
      </ul>
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
