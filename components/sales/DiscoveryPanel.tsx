'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api/client'

export interface DiscoveryState {
  qualification: 'QUALIFIED' | 'NOT_QUALIFIED' | 'NEEDS_FOLLOW_UP' | null
  discovery: Partial<Record<'business' | 'operations' | 'technical' | 'commercial', Record<string, string>>> | null
  nextAction: string | null
  nextActionAt: string | null
}

// Labels mirror docs/gco-sales-operating-playbook.md (discovery call questions). All answers are short plain text.
const SECTIONS: { key: 'business' | 'operations' | 'technical' | 'commercial'; title: string; fields: [string, string][] }[] = [
  { key: 'business', title: 'Business', fields: [['company', 'Company'], ['website', 'Website'], ['industry', 'Industry'], ['service', 'Service wanted'], ['targetMarket', 'Target market'], ['conversationVolume', 'Current conversation volume'], ['currentOperation', 'Current support / sales operation'], ['pain', 'Pain'], ['desiredOutcome', 'Desired outcome'], ['urgency', 'Urgency'], ['decisionMaker', 'Decision maker']] },
  { key: 'operations', title: 'Operations', fields: [['channels', 'Communication channels'], ['operatingHours', 'Operating hours'], ['languages', 'Languages'], ['coverage', 'Coverage'], ['expectedVolume', 'Expected volume'], ['escalation', 'Escalation requirements'], ['operatorNeeds', 'Operator needs'], ['supervisorNeeds', 'Supervisor needs']] },
  { key: 'technical', title: 'Technical', fields: [['channelProvider', 'Channel / provider'], ['existingApi', 'Existing API'], ['webhookCapability', 'Webhook capability'], ['apiDocumentation', 'API documentation (link only)'], ['sandbox', 'Sandbox available'], ['technicalContact', 'Technical contact'], ['callbackRequirements', 'Callback URL requirements'], ['authMethod', 'Authentication method (type only)']] },
  { key: 'commercial', title: 'Commercial', fields: [['scope', 'Scope'], ['pilot', 'Pilot'], ['pricing', 'Pricing'], ['startDate', 'Expected start date'], ['decisionProcess', 'Decision process'], ['nextStep', 'Next step']] },
]

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

/** Discovery-call record for one lead. NEVER enter API keys, passwords, tokens or secrets - the server refuses them. */
export function DiscoveryPanel({ leadId, initial, onSaved }: { leadId: string; initial: DiscoveryState; onSaved?: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const discovery = Object.fromEntries(
      SECTIONS.map((s) => [s.key, Object.fromEntries(s.fields.map(([k]) => [k, String(f.get(`${s.key}.${k}`) ?? '')]))]),
    )
    const when = String(f.get('nextActionAt') ?? '')
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await apiFetch(`/crm/leads/${leadId}/discovery`, {
        method: 'PATCH',
        body: JSON.stringify({
          qualification: String(f.get('qualification') || '') || null,
          nextAction: String(f.get('nextAction') ?? ''),
          nextActionAt: when ? new Date(when).toISOString() : null,
          discovery,
        }),
      })
      setMsg('Saved')
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const input = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-xs font-normal'
  return (
    <form onSubmit={save} className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4 text-xs" aria-label="Discovery and qualification">
      <p className="text-[11px] text-slate-500">Never enter API keys, passwords, tokens or secrets here - they are refused. Capture facts only.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="font-medium text-slate-700">Qualification
          <select name="qualification" defaultValue={initial.qualification ?? ''} className={input}>
            <option value="">Not assessed</option>
            <option value="QUALIFIED">Qualified</option>
            <option value="NEEDS_FOLLOW_UP">Needs follow-up</option>
            <option value="NOT_QUALIFIED">Not qualified</option>
          </select>
        </label>
        <label className="font-medium text-slate-700">Next action
          <input name="nextAction" defaultValue={initial.nextAction ?? ''} maxLength={200} placeholder="e.g. send the proposal" className={input} />
        </label>
        <label className="font-medium text-slate-700">Due
          <input name="nextActionAt" type="datetime-local" defaultValue={toLocalInput(initial.nextActionAt)} className={input} />
        </label>
      </div>
      {SECTIONS.map((s) => (
        <details key={s.key} className="rounded border border-slate-200 bg-white">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">{s.title} questions</summary>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {s.fields.map(([k, label]) => (
              <label key={k} className="font-medium text-slate-600">{label}
                <input name={`${s.key}.${k}`} defaultValue={initial.discovery?.[s.key]?.[k] ?? ''} maxLength={300} className={input} />
              </label>
            ))}
          </div>
        </details>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save discovery'}</button>
        {msg && <span role="status" className="text-emerald-700">{msg}</span>}
        {error && <span role="alert" className="text-red-600">{error}</span>}
      </div>
    </form>
  )
}
