'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { LANGUAGE_NAMES } from '@/lib/languages'

interface Client { tenantId: string; name: string; service: string; ready: boolean; samples: { lang: string; customer: string; text: string }[] }
interface Out { id: string; customer: string; language: string | null; text: string; at: string }

// Staging-only: stand in for a client's messaging platform. Sends customer messages into a chosen fictional client through the
// real signed webhook, and shows the replies the platform would receive. The API behind it returns 404 outside staging.
export default function StagingPage() {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [tenantId, setTenantId] = useState('')
  const [customer, setCustomer] = useState('Test Customer')
  const [language, setLanguage] = useState('en')
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [outbox, setOutbox] = useState<Out[]>([])

  useEffect(() => {
    apiFetch<Client[]>('/staging/clients').then((c) => { setClients(c); if (c[0]) setTenantId(c[0].tenantId) }).catch(() => setMissing(true))
  }, [])
  const loadOutbox = useCallback(() => { if (tenantId) apiFetch<Out[]>(`/staging/outbox?tenantId=${tenantId}`).then(setOutbox).catch(() => undefined) }, [tenantId])
  useEffect(() => { loadOutbox(); const t = setInterval(loadOutbox, 5000); return () => clearInterval(t) }, [loadOutbox])

  const current = clients?.find((c) => c.tenantId === tenantId)
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await apiFetch('/staging/simulate', { method: 'POST', body: JSON.stringify({ tenantId, customer, text, language: language || undefined }) })
      setMsg({ ok: true, text: 'Message sent to GCO as that client’s customer. It is now in the queue.' }); setText('')
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed' }) } finally { setBusy(false) }
  }

  if (missing) return <main className="p-8"><p className="text-sm text-slate-600">The staging tools are not available here (this is not the staging environment, or you are not the owner).</p></main>
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-slate-900">Staging tools: simulated client platform</h1>
        <Link href="/admin" className="text-sm font-medium text-brand-600 hover:underline">Back to Admin</Link>
      </header>
      <p className="text-sm text-slate-600">Everything here is fictional. Pick a client, send a customer message, then answer it from the operator view and watch the reply arrive below.</p>

      <section className="grid gap-6 md:grid-cols-2">
        <form onSubmit={send} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900">Send a customer message</h2>
          <label className="block text-xs font-medium text-slate-600">Client
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {clients?.map((c) => <option key={c.tenantId} value={c.tenantId}>{c.name}{c.ready ? '' : ' (no simulated platform)'}</option>)}
            </select>
          </label>
          {current && <p className="text-xs text-slate-500">{current.service}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">Customer name
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={80} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-slate-600">Customer language
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Not specified</option>
                {Object.entries(LANGUAGE_NAMES).map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600">Message
            <textarea value={text} onChange={(e) => setText(e.target.value)} required maxLength={4000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          {current && current.samples.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {current.samples.map((s, i) => (
                <button type="button" key={i} onClick={() => { setCustomer(s.customer); setLanguage(s.lang); setText(s.text) }} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300">
                  Sample ({s.lang})
                </button>
              ))}
            </div>
          )}
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
          <button disabled={busy || !tenantId || !text.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send as customer'}</button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900">Replies received by the client platform</h2>
          <p className="text-xs text-slate-500">Newest first. Refreshes every few seconds.</p>
          <ul className="mt-3 space-y-2">
            {outbox.map((o) => (
              <li key={o.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="text-xs text-slate-500">To {o.customer}{o.language ? ` (${o.language})` : ''} · {new Date(o.at).toLocaleTimeString()}</div>
                <div className="mt-0.5 text-slate-800">{o.text}</div>
              </li>
            ))}
            {outbox.length === 0 && <li className="text-sm text-slate-400">No replies yet.</li>}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-slate-900">Suggested test round</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Send a message in each language to one client and watch it go to a matching, available operator (Manager view → Language coverage).</li>
          <li>Send one in a language nobody covers: it waits and an alert appears. Add the language to an operator and watch it assign.</li>
          <li>Send more messages than the team&rsquo;s capacity and watch the queue; let a response timer run out.</li>
          <li>Reply as the operator, escalate one conversation, claim it as a supervisor, then resolve it.</li>
          <li>Score a reply in Quality review, then open Reports as the client contact.</li>
          <li>Do the same on a second client to confirm the teams, data and settings stay separate.</li>
          <li>Create a brand-new client in Admin → Onboarding, invite its team, and connect a simulated platform.</li>
        </ol>
      </section>
    </main>
  )
}
