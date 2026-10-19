'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Template { key: string; label: string; suggestedServices: string[]; responseSlaSeconds: number; operatorCapacity: number; workspace: { plannedModules: string[]; availableModules: string[] } }
const SERVICES = [['LIVE_CHAT_SUPPORT', 'Live chat / customer support'], ['CHAT_MODERATION', 'Chat moderation'], ['COMMUNITY_MODERATION', 'Community moderation'], ['MULTILINGUAL_CHAT', 'Multilingual chat operations'], ['COVERAGE_24_7', '24/7 chat coverage'], ['DEDICATED_TEAM', 'Dedicated / outsourced team']] as const
const LANGS = ['en', 'es', 'fr', 'de', 'it', 'sv'] as const
const HOURS = { '24/7': null, 'Mon–Fri 09:00–18:00': Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri'].map((d) => [d, { open: '09:00', close: '18:00' }])), 'Daily 08:00–22:00': Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open: '08:00', close: '22:00' }])) } as const
const toCents = (v: string) => (v.trim() === '' ? null : Math.round(parseFloat(v.replace(',', '.')) * 100))
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

interface Result { tenantId: string; slug: string; warnings: string[]; invitations: { email: string; role: string; setupUrl: string; expiresAt: string }[]; workspace: { availableModules: string[]; plannedModules: string[] } }

export default function NewClientWizard() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [f, setF] = useState({ name: '', slug: '', industry: 'ECOMMERCE', services: ['LIVE_CHAT_SUPPORT'] as string[], languages: ['en'] as string[], timezone: 'Europe/Rome', hours: '24/7', sla: '120', capacity: '2', cap: '', model: 'PER_MESSAGE', priceMsg: '0.14', priceTicket: '', priceHour: '', monthly: '', vat: '22', vatNote: '', pay: '0.06', payBasis: 'DELIVERED', ai: 'AI_ASSISTED', approval: false, clientEmail: '', clientName: '', staff: '' })
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { apiFetch<Template[]>('/admin/clients/setup').then(setTemplates).catch(() => {}) }, [])
  const pickIndustry = (key: string) => {
    const t = templates.find((x) => x.key === key)
    setF((p) => ({ ...p, industry: key, ...(t ? { services: t.suggestedServices, sla: String(t.responseSlaSeconds), capacity: String(t.operatorCapacity) } : {}) }))
  }
  const toggle = (k: 'services' | 'languages', v: string) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }))
  const tpl = templates.find((t) => t.key === f.industry)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      // one line per person: email, name, role (manager|supervisor|operator), optional languages separated by spaces
      const staff = f.staff.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [email, name, role, ...langs] = l.split(',').map((x) => x.trim()); return { email: email ?? '', name: name ?? '', role: (role ?? 'operator').toUpperCase(), ...(langs.length ? { languages: langs.join(' ').split(/\s+/).filter(Boolean) } : {}) } })
      const r = await apiFetch<Result>('/admin/clients/setup', { method: 'POST', body: JSON.stringify({
        company: { name: f.name, slug: f.slug || slugify(f.name) }, industry: f.industry, services: f.services, languages: f.languages, timezone: f.timezone,
        operatingHours: HOURS[f.hours as keyof typeof HOURS], responseSlaSeconds: Number(f.sla), operatorCapacity: Number(f.capacity), messageCap: f.cap ? Number(f.cap) : null,
        billing: { model: f.model, pricePerMessageEurCents: toCents(f.priceMsg) ?? 0, pricePerTicketEurCents: toCents(f.priceTicket), pricePerHourEurCents: toCents(f.priceHour), monthlyFeeEurCents: toCents(f.monthly), vatRatePercent: Number(f.vat), vatNote: f.vatNote || null },
        operatorPay: toCents(f.pay) === null ? null : { amountEurCents: toCents(f.pay), basis: f.payBasis }, aiMode: f.ai, requireOperatorApproval: f.approval,
        clientContact: f.clientEmail ? { email: f.clientEmail, name: f.clientName || f.name } : null, staff,
      }) })
      setResult(r)
    } catch (err) { setError(err instanceof Error ? err.message : 'Setup failed') } finally { setBusy(false) }
  }

  const input = 'rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full'
  const card = 'mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm'
  const label = 'text-xs text-slate-500 block'

  if (result) return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-lg font-semibold text-slate-900">Client created</h1>
      <p className="mb-4 text-sm text-slate-600">Modules switched on now: {result.workspace.availableModules.join(', ') || 'none'}. Planned (not built yet): {result.workspace.plannedModules.join(', ') || 'none'}.</p>
      {result.warnings.map((w) => <p key={w} className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</p>)}
      <div className={card}><h2 className="mb-2 text-sm font-semibold">One-time setup links (shown once - copy them now)</h2>
        {result.invitations.length === 0 ? <p className="text-sm text-slate-400">No invitations.</p> : <ul className="space-y-2 text-sm">{result.invitations.map((i) => <li key={i.email}><b>{i.email}</b> · {i.role.toLowerCase()}<br /><input readOnly value={i.setupUrl} onFocus={(e) => e.currentTarget.select()} className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs" /><span className="text-xs text-slate-500">expires {new Date(i.expiresAt).toLocaleDateString('en-GB')}</span></li>)}</ul>}
      </div>
      <a href="/admin" className="text-sm font-medium text-brand-600 hover:underline">Back to dashboard</a>
    </div>
  )

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-slate-900">Set up a new client</h1>
      <p className="mb-4 text-sm text-slate-500">The industry picks the starting template; the services you tick decide which modules are switched on. Everything stays editable afterwards.</p>
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <section className={card}><h2 className="mb-2 text-sm font-semibold">1. Company</h2>
        <div className="grid gap-2 sm:grid-cols-2"><label className={label}>Company name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugify(e.target.value) })} className={input} /></label><label className={label}>Short name (used internally)<input required value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} className={input} /></label></div></section>

      <section className={card}><h2 className="mb-2 text-sm font-semibold">2. Industry and 3. Services</h2>
        <select value={f.industry} onChange={(e) => pickIndustry(e.target.value)} className={input + ' mb-3 sm:w-1/2'}>{templates.length ? templates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>) : <option value="ECOMMERCE">E-commerce</option>}</select>
        <div className="grid gap-1 sm:grid-cols-2">{SERVICES.map(([k, l]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.services.includes(k)} onChange={() => toggle('services', k)} />{l}</label>)}</div>
        {tpl && <p className="mt-2 text-xs text-slate-500">Template defaults: response time {tpl.responseSlaSeconds}s, {tpl.operatorCapacity} chats per operator.</p>}</section>

      <section className={card}><h2 className="mb-2 text-sm font-semibold">4. Languages and hours · 5. Response times and limits</h2>
        <div className="mb-2 flex flex-wrap gap-3 text-sm">{LANGS.map((l) => <label key={l} className="flex items-center gap-1"><input type="checkbox" checked={f.languages.includes(l)} onChange={() => toggle('languages', l)} />{l.toUpperCase()}</label>)}</div>
        <div className="grid gap-2 sm:grid-cols-4"><label className={label}>Operating hours<select value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} className={input}>{Object.keys(HOURS).map((h) => <option key={h}>{h}</option>)}</select></label><label className={label}>Timezone<input value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} className={input} /></label><label className={label}>Reply within (seconds)<input value={f.sla} onChange={(e) => setF({ ...f, sla: e.target.value })} className={input} /></label><label className={label}>Chats per operator<input value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} className={input} /></label><label className={label}>Monthly message cap (optional)<input value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} className={input} /></label></div></section>

      <section className={card}><h2 className="mb-2 text-sm font-semibold">7. Client billing and operator pay</h2>
        <div className="grid gap-2 sm:grid-cols-4"><label className={label}>Billing model<select value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} className={input}><option value="PER_MESSAGE">Per message</option><option value="PER_TICKET">Per ticket</option><option value="PER_HOUR">Per hour</option><option value="MONTHLY_FLAT">Monthly fee</option></select></label>
          <label className={label}>Per message (EUR)<input value={f.priceMsg} onChange={(e) => setF({ ...f, priceMsg: e.target.value })} className={input} /></label><label className={label}>Per ticket (EUR)<input value={f.priceTicket} onChange={(e) => setF({ ...f, priceTicket: e.target.value })} className={input} /></label><label className={label}>Per hour (EUR)<input value={f.priceHour} onChange={(e) => setF({ ...f, priceHour: e.target.value })} className={input} /></label>
          <label className={label}>Monthly fee (EUR)<input value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} className={input} /></label><label className={label}>VAT %<input value={f.vat} onChange={(e) => setF({ ...f, vat: e.target.value })} className={input} /></label><label className={label + ' sm:col-span-2'}>VAT note (reverse charge etc.)<input value={f.vatNote} onChange={(e) => setF({ ...f, vatNote: e.target.value })} className={input} /></label>
          <label className={label}>Operator pay per message (EUR)<input value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value })} className={input} /></label><label className={label}>Payable when<select value={f.payBasis} onChange={(e) => setF({ ...f, payBasis: e.target.value })} className={input}><option value="DELIVERED">Delivered</option><option value="APPROVED">Approved by review</option></select></label></div></section>

      <section className={card}><h2 className="mb-2 text-sm font-semibold">8. AI operating mode</h2>
        <select value={f.ai} onChange={(e) => setF({ ...f, ai: e.target.value })} className={input + ' sm:w-1/2'}><option value="HUMAN_ONLY">Human only</option><option value="AI_ASSISTED">AI assisted (operators review and send)</option><option value="AI_PLUS_HUMAN" disabled>AI + Human (not available yet)</option></select>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.approval} onChange={(e) => setF({ ...f, approval: e.target.checked })} /> Operators need manager approval for this client before they can take conversations</label></section>

      <section className={card}><h2 className="mb-2 text-sm font-semibold">9. People and 10. Invitations</h2>
        <div className="grid gap-2 sm:grid-cols-2"><label className={label}>Client contact email<input type="email" value={f.clientEmail} onChange={(e) => setF({ ...f, clientEmail: e.target.value })} className={input} /></label><label className={label}>Client contact name<input value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} className={input} /></label></div>
        <label className={label + ' mt-2'}>GCO staff, one per line: email, name, role (manager / supervisor / operator), languages (operators; empty = the client languages)<textarea rows={4} value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })} placeholder={'ana@example.com, Ana Rossi, manager\nluis@example.com, Luis Gómez, operator, es en'} className={input + ' font-mono text-xs'} /></label>
        <p className="mt-2 text-xs text-slate-500">Each person gets a one-time link to choose their own password. Links are shown once after you create the client.</p></section>

      <button disabled={busy || !f.name || f.services.length === 0} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create client'}</button>
      <a href="/admin" className="ml-4 text-sm text-slate-500 hover:underline">Cancel</a>
    </form>
  )
}
