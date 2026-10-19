'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Tenant { id: string; name: string }
interface Regime { key: string; label: string; requestDeadlineDays: number; notes: string }
interface Policy { messageRetentionDays: number | null; regulations: string[]; dataRegion: string | null; regimes: Regime[] }
interface Req { id: string; tenantId: string; kind: 'EXPORT' | 'ERASURE'; subjectHint: string; status: string; dueAt: string; note: string | null }

export default function PrivacyPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [form, setForm] = useState({ days: '', region: '', regs: ['GDPR'] as string[] })
  const [reqs, setReqs] = useState<Req[]>([])
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [dry, setDry] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => { apiFetch<Tenant[]>('/admin/tenants').then((t) => { setTenants(t); const want = new URLSearchParams(window.location.search).get('tenantId'); const pick = t.find((x) => x.id === want) ?? t[0]; if (pick) setTenantId(pick.id) }).catch(() => {}) }, [])
  const load = useCallback(() => Promise.all([tenantId ? apiFetch<Policy>(`/admin/privacy/policy?tenantId=${tenantId}`) : null, apiFetch<Req[]>('/admin/privacy/requests')]).then(([p, r]) => { if (p) { setPolicy(p); setForm({ days: p.messageRetentionDays === null ? '' : String(p.messageRetentionDays), region: p.dataRegion ?? '', regs: p.regulations }) } setReqs(r) }).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load' })), [tenantId])
  useEffect(() => { load() }, [load])
  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ kind: 'ok', text: ok }); return load() }).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500"><span className="text-xs font-bold text-white">G</span></div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Privacy: retention and data requests</h1>
        <a href="/admin" className="ml-auto text-sm font-medium text-brand-600 hover:underline">Back to dashboard</a>
      </div>
      <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">These are technical controls. Retention periods, deadlines and transfer rules must be confirmed by qualified legal counsel for each client and country before they are relied on.</p>
      {msg && <p className={`mb-4 rounded-lg px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mb-4 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>

      {policy && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Policy for this client</h2>
          <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); act(() => apiFetch('/admin/privacy/policy', { method: 'PUT', body: JSON.stringify({ tenantId, messageRetentionDays: form.days ? Number(form.days) : null, dataRegion: form.region || null, regulations: form.regs }) }), 'Policy saved.') }}>
            <label className="text-xs text-slate-500">Keep conversation content for (days, empty = no automatic removal)<input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
            <label className="text-xs text-slate-500">Data region (as agreed in the DPA)<input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900" /></label>
            <fieldset className="text-sm sm:col-span-2"><legend className="text-xs text-slate-500">Regimes that apply</legend>{policy.regimes.map((r) => <label key={r.key} title={r.notes} className="mr-4 inline-flex items-center gap-1"><input type="checkbox" checked={form.regs.includes(r.key)} onChange={(e) => setForm({ ...form, regs: e.target.checked ? [...form.regs, r.key] : form.regs.filter((x) => x !== r.key) })} />{r.label} <span className="text-xs text-slate-400">({r.requestDeadlineDays}d)</span></label>)}</fieldset>
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white sm:col-span-1">Save policy</button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => apiFetch<{ clients: { counts: { wouldRedactConversations?: number } }[] }>('/admin/privacy/retention', { method: 'POST', body: JSON.stringify({ tenantId, dryRun: true }) }).then((r) => setDry(r.clients.length ? `${r.clients[0]!.counts.wouldRedactConversations ?? 0} conversation(s) would lose their personal content.` : 'No retention window is set for this client.')).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))} className="rounded-lg border border-slate-300 px-3 py-1.5">Preview removal</button>
            <button onClick={() => { if (window.confirm('Remove personal content from every conversation past the retention window? This cannot be undone.')) act(() => apiFetch('/admin/privacy/retention', { method: 'POST', body: JSON.stringify({ tenantId, dryRun: false }) }), 'Retention applied.') }} className="rounded-lg bg-red-600 px-3 py-1.5 text-white">Apply now</button>
            {dry && <span className="text-slate-600">{dry}</span>}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Data-subject requests</h2></div>
        {exported && <div className="border-b border-slate-200 bg-slate-50 p-3 text-xs"><p className="mb-1 font-semibold text-slate-700">Export (shown once - copy it now)</p><textarea readOnly rows={8} value={exported} className="w-full rounded border border-slate-300 p-2 font-mono" /></div>}
        <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Client</th><th>Type</th><th>User</th><th>Due</th><th>Status</th><th /></tr></thead><tbody>
          {reqs.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No requests.</td></tr>}
          {reqs.map((r) => (
            <tr key={r.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{tenants.find((t) => t.id === r.tenantId)?.name ?? '…'}</td><td>{r.kind === 'EXPORT' ? 'Export' : 'Erasure'}</td><td>…{r.subjectHint}</td><td className={new Date(r.dueAt) < new Date() && r.status === 'OPEN' ? 'font-semibold text-red-600' : ''}>{new Date(r.dueAt).toLocaleDateString('en-GB')}</td><td>{r.status.toLowerCase()}</td>
              <td className="pr-4 text-right">{r.status === 'OPEN' && <span className="inline-flex items-center gap-2"><input value={refs[r.id] ?? ''} onChange={(e) => setRefs({ ...refs, [r.id]: e.target.value })} placeholder="Re-enter the user id to confirm" className="w-48 rounded border border-slate-300 px-2 py-1 text-xs" />
                <button onClick={() => { if (r.kind === 'ERASURE' && !window.confirm('Erase this person\'s conversation content? This cannot be undone.')) return; act(() => apiFetch<{ export: unknown }>(`/admin/privacy/requests/${r.id}/execute`, { method: 'POST', body: JSON.stringify({ subjectRef: refs[r.id] ?? '' }) }).then((res) => { setExported(res.export ? JSON.stringify(res.export, null, 2) : null) }), r.kind === 'EXPORT' ? 'Export generated below.' : 'Erasure completed.') }} className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white">Execute</button>
                <button onClick={() => { const reason = window.prompt('Reason for rejecting'); if (reason) act(() => apiFetch(`/admin/privacy/requests/${r.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }), 'Rejected.') }} className="text-xs text-red-600 hover:underline">Reject</button></span>}</td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </div>
  )
}
