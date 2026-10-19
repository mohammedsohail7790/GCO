'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Person { userId: string; invitationId: string | null; email: string; name: string; role: 'OPERATOR' | 'MANAGER' | 'SUPERVISOR'; state: 'active' | 'invited' | 'expired' | 'cancelled' | 'disabled'; expiresAt: string | null; operatorStatus: string | null; languages: string[] }
const STATE: Record<Person['state'], string> = { active: 'bg-emerald-100 text-emerald-700', invited: 'bg-amber-100 text-amber-800', expired: 'bg-slate-100 text-slate-500', cancelled: 'bg-slate-100 text-slate-500', disabled: 'bg-red-100 text-red-700' }

/** A client's operators and managers. People are invited by a one-time link and choose their own password. */
export function StaffPanel({ tenantId, onChanged }: { tenantId: string; onChanged: () => void }) {
  const [people, setPeople] = useState<Person[]>([])
  const [link, setLink] = useState<{ url: string; who: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => { apiFetch<Person[]>(`/admin/staff-invitations?tenantId=${encodeURIComponent(tenantId)}`).then(setPeople).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load')) }, [tenantId])
  useEffect(() => { load() }, [load])

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError(null); setCopied(false)
    const languages = String(f.get('languages') ?? '').split(/[,\s]+/).filter(Boolean)
    try {
      const r = await apiFetch<{ setupUrl: string; expiresAt: string }>('/admin/staff-invitations', { method: 'POST', body: JSON.stringify({ tenantId, displayName: String(f.get('name')), email: String(f.get('email')), role: String(f.get('role')), ...(languages.length ? { languages } : {}) }) })
      setLink({ url: r.setupUrl, who: String(f.get('name')), expiresAt: r.expiresAt })
      ;(e.target as HTMLFormElement).reset()
      load(); onChanged()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send the invitation') }
  }
  async function act(p: Person, what: 'reissue' | 'cancel') {
    setError(null); setCopied(false)
    try {
      const r = await apiFetch<{ setupUrl?: string; expiresAt?: string }>(`/admin/staff-invitations/${p.invitationId}/${what}`, { method: 'POST' })
      if (r.setupUrl) setLink({ url: r.setupUrl, who: p.name, expiresAt: r.expiresAt ?? '' })
      load(); onChanged()
    } catch (err) { setError(err instanceof Error ? err.message : 'Action failed') }
  }

  return (
    <section aria-label="Staff for this client" className="space-y-2 rounded border border-slate-200 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operators and managers</h3>
      <p className="text-[11px] text-slate-500">Each person gets a one-time setup link and chooses their own password. GCO staff never see or set it.</p>
      {people.length === 0 ? <p className="text-xs text-slate-500">No one yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {people.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
              <span className="text-slate-800"><span className="font-medium">{p.name}</span> · {p.email} · {p.role.toLowerCase()}{p.role === 'OPERATOR' && p.languages.length > 0 && <> · {p.languages.join(', ').toUpperCase()}</>}{p.state === 'active' && p.operatorStatus && <> · {p.operatorStatus.toLowerCase()}</>}</span>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE[p.state]}`}>{p.state === 'invited' && p.expiresAt ? `invited · expires ${new Date(p.expiresAt).toLocaleDateString()}` : p.state}</span>
                {p.invitationId && (p.state === 'invited' || p.state === 'expired') && <button onClick={() => act(p, 'reissue')} className="text-brand-600 hover:underline">New link</button>}
                {p.invitationId && p.state === 'invited' && <button onClick={() => act(p, 'cancel')} className="text-slate-500 hover:underline">Cancel</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {link && (
        <div role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-medium">Setup link for {link.who} — shown once. Send it to them yourself; it expires {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'in 7 days'}.</p>
          <p className="mt-1 break-all font-mono text-[11px]">{link.url}</p>
          <button className="mt-1 rounded border border-amber-300 bg-white px-2 py-0.5" onClick={() => { navigator.clipboard?.writeText(link.url).then(() => setCopied(true)).catch(() => {}) }}>{copied ? 'Copied' : 'Copy link'}</button>
          <button className="ml-2 text-amber-800 underline" onClick={() => setLink(null)}>Hide</button>
        </div>
      )}
      <form className="grid gap-2 sm:grid-cols-4" onSubmit={invite}>
        <input name="name" required maxLength={120} placeholder="Name" aria-label="Staff name" className="rounded border border-slate-300 px-2 py-1 text-xs" />
        <input name="email" type="email" required placeholder="Email" aria-label="Staff email" className="rounded border border-slate-300 px-2 py-1 text-xs" />
        <select name="role" aria-label="Role" className="rounded border border-slate-300 px-2 py-1 text-xs"><option value="OPERATOR">Operator</option><option value="MANAGER">Manager</option><option value="SUPERVISOR">Supervisor</option></select>
        <input name="languages" placeholder="Languages (en, es) — operators" aria-label="Languages" className="rounded border border-slate-300 px-2 py-1 text-xs" />
        <button className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 sm:col-span-4 sm:justify-self-start">Create invitation</button>
      </form>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  )
}
