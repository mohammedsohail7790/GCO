'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Adapter { key: string; productionCapable: boolean; usableForGoLive: boolean; supportsVerification: boolean; requiresCallbackUrl: boolean }
interface Integration {
  id: string
  name: string
  adapterKey: string
  status: 'ACTIVE' | 'DISABLED' | 'DEGRADED'
  config: { callbackUrl?: string }
  tenant: { id: string; name: string }
  productionCapable: boolean
  usableForGoLive: boolean
  requiresVerification: boolean
  verification: { outboundAt: string | null; inboundAt: string | null }
  verified: boolean
}
interface Tenant { id: string; name: string }

const STATUS_HELP: Record<string, string> = {
  DISABLED: 'Staged: accepts only a signed test ping. Goes ACTIVE through the client go-live.',
  ACTIVE: 'Live: receives customer messages and delivers operator replies.',
  DEGRADED: 'Never activated by go-live. Fix or replace it.',
}
const PILL: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-800', DISABLED: 'bg-slate-100 text-slate-700', DEGRADED: 'bg-red-100 text-red-700' }

/** CEO-only integration console. A secret is shown exactly once (on create / rotate) and can never be displayed again. */
export function IntegrationConsole() {
  const [adapters, setAdapters] = useState<Adapter[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [items, setItems] = useState<Integration[] | null>(null)
  const [form, setForm] = useState({ tenantId: '', adapterKey: '', name: '', callbackUrl: '' })
  const [secret, setSecret] = useState<{ forName: string; value: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<Integration[]>('/admin/integrations').then(setItems).catch(() => setItems([]))
  }, [])
  useEffect(() => {
    load()
    apiFetch<Adapter[]>('/admin/integrations/adapters').then(setAdapters).catch(() => {})
    apiFetch<Tenant[]>('/admin/tenants').then(setTenants).catch(() => {})
  }, [load])

  const usable = adapters.filter((a) => a.usableForGoLive)
  const chosen = adapters.find((a) => a.key === form.adapterKey)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMsg(null)
    setBusy('create')
    try {
      const created = await apiFetch<{ webhookSecret: string; name: string }>('/admin/integrations', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: form.tenantId,
          adapterKey: form.adapterKey,
          name: form.name,
          status: 'DISABLED', // always staged; go-live activates it
          config: chosen?.requiresCallbackUrl ? { callbackUrl: form.callbackUrl.trim() } : {},
        }),
      })
      setSecret({ forName: created.name, value: created.webhookSecret })
      setForm({ tenantId: form.tenantId, adapterKey: form.adapterKey, name: '', callbackUrl: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the integration')
    } finally {
      setBusy(null)
    }
  }

  async function verify(i: Integration) {
    setBusy(i.id)
    setError(null)
    setMsg(null)
    try {
      const r = await apiFetch<{ outbound: { ok: boolean; category: string | null }; verified: boolean }>(`/admin/integrations/${i.id}/verify`, { method: 'POST', body: '{}' })
      setMsg(r.outbound.ok ? (r.verified ? 'Verified in both directions.' : 'GCO reached the client endpoint. Now the client must send its signed test ping to the webhook URL.') : `Outbound check failed (${r.outbound.category ?? 'error'}). Check the callback URL and that the client uses the shared secret.`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setBusy(null)
    }
  }

  async function rotate(i: Integration) {
    if (!window.confirm(`Rotate the secret for "${i.name}"? The old secret stops working immediately and verification is cleared - the client must switch to the new secret and you must verify again.`)) return
    setBusy(i.id)
    setError(null)
    try {
      const r = await apiFetch<{ secret: string }>(`/admin/integrations/${i.id}/webhook-secret`, { method: 'PATCH', body: '{}' })
      setSecret({ forName: i.name, value: r.secret })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rotation failed')
    } finally {
      setBusy(null)
    }
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const input = 'mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm'

  return (
    <section className="mb-8 rounded-lg border border-slate-200 bg-white" aria-labelledby="integrations-heading">
      <div className="border-b border-slate-200 p-4">
        <h2 id="integrations-heading" className="font-semibold text-slate-900">Client integrations</h2>
        <p className="mt-0.5 text-xs text-slate-500">New integrations are always staged (DISABLED). Only adapters GCO marks production-capable can go live; the development mock never can.</p>
      </div>

      {secret && (
        <div role="alert" className="m-4 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">Secret for &quot;{secret.forName}&quot; - copy it now. It is shown once and can never be displayed again. Deliver it to the client through a secure channel.</p>
          <input readOnly value={secret.value} onFocus={(e) => e.currentTarget.select()} aria-label="One-time webhook secret" className="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 font-mono text-xs" />
          <button onClick={() => setSecret(null)} className="mt-2 rounded border border-amber-400 px-2 py-1 text-xs text-amber-900">I have copied it - hide</button>
        </div>
      )}
      {msg && <p role="status" className="px-4 pt-3 text-xs text-emerald-700">{msg}</p>}
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{error}</p>}

      <form onSubmit={create} className="grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-700">Client (tenant)
          <select required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} className={input}>
            <option value="">Select…</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">Adapter
          <select required value={form.adapterKey} onChange={(e) => setForm({ ...form, adapterKey: e.target.value })} className={input}>
            <option value="">Select…</option>
            {usable.map((a) => <option key={a.key} value={a.key}>{a.key}</option>)}
          </select>
          {adapters.some((a) => !a.usableForGoLive) && <span className="mt-1 block text-[11px] font-normal text-slate-500">Development-only adapters are not offered: they simulate delivery and can never go live.</span>}
        </label>
        <label className="text-xs font-medium text-slate-700">Name
          <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="e.g. Acme production" />
        </label>
        {chosen?.requiresCallbackUrl && (
          <label className="text-xs font-medium text-slate-700">Client callback URL (https)
            <input required value={form.callbackUrl} onChange={(e) => setForm({ ...form, callbackUrl: e.target.value })} className={input} placeholder="https://client.example.com/hooks/gco" inputMode="url" />
          </label>
        )}
        <div className="sm:col-span-2">
          <button disabled={busy === 'create' || usable.length === 0} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{busy === 'create' ? 'Creating…' : 'Create staged integration'}</button>
          {usable.length === 0 && adapters.length > 0 && <span className="ml-2 text-xs text-red-600">No production-capable adapter is available.</span>}
        </div>
      </form>

      {items === null ? (
        <p className="p-4 text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="border-t border-slate-200 p-4 text-sm text-slate-400">No integrations yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-200">
          {items.map((i) => (
            <li key={i.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">{i.name}</span>
                <span className="text-slate-500">· {i.tenant.name} · {i.adapterKey}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL[i.status]}`}>{i.status}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${i.usableForGoLive ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{i.productionCapable ? 'production-capable' : 'development only - cannot go live'}</span>
                {i.requiresVerification && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${i.verified ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{i.verified ? 'verified' : 'not verified'}</span>}
              </div>
              <p className="text-xs text-slate-500">{STATUS_HELP[i.status]}</p>
              <p className="break-all text-xs text-slate-600">Client sends to: <span className="font-mono">{origin}/api/v1/webhooks/{i.id}</span></p>
              {i.config.callbackUrl && <p className="break-all text-xs text-slate-600">GCO sends replies to: <span className="font-mono">{i.config.callbackUrl}</span></p>}
              {i.requiresVerification && <p className="text-xs text-slate-600">Outbound test: {i.verification.outboundAt ? 'passed' : 'not run'} · Inbound test (client ping): {i.verification.inboundAt ? 'received' : 'not received'}</p>}
              <div className="flex flex-wrap gap-2">
                {i.requiresVerification && <button disabled={busy === i.id} onClick={() => verify(i)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">Verify (send signed test)</button>}
                <button disabled={busy === i.id} onClick={() => rotate(i)} className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">Rotate secret</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
