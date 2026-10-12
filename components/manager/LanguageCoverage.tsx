'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { LANGUAGE_NAMES, normalizeLanguage } from '@/lib/languages'
import { StatusPill } from '@/components/ui/StatusPill'

interface Coverage {
  languages: { code: string | null; label: string; queued: number; active: number; covered: boolean }[]
  operators: { id: string; name: string; status: string; languages: string[] }[]
}

// Manager view of language handling: which languages are in play, whether an available operator covers each, and
// which languages each operator handles. There is no automatic translation or detection - language comes from the
// client's platform and operator languages are set here.
export function LanguageCoverage() {
  const [data, setData] = useState<Coverage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const load = useCallback(() => {
    apiFetch<Coverage>('/operators/language-coverage').then((d) => { setData(d); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [load])

  async function save(operatorId: string) {
    const codes = draft.split(/[,\s]+/).filter(Boolean)
    if (codes.some((c) => !normalizeLanguage(c))) { setError('Use two-letter codes such as en, es, fr'); return }
    try {
      await apiFetch(`/operators/${operatorId}/languages`, { method: 'PATCH', body: JSON.stringify({ languages: codes }) })
      setEditing(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="lang-cov">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 id="lang-cov" className="text-sm font-semibold text-slate-900">Language coverage</h2>
        <p className="text-xs text-slate-500">Conversations are routed only to operators who handle their language. An operator with no languages set takes any language.</p>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{error}</p>}
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Conversations by language</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Language</th><th>In progress</th><th>Waiting</th><th>Operator coverage</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.languages.map((l) => (
                <tr key={l.code ?? 'none'}>
                  <td className="py-1.5 font-medium text-slate-800">{l.label}{l.code && <span className="ml-1.5 text-xs uppercase text-slate-400">{l.code}</span>}</td>
                  <td className="tabular-nums">{l.active}</td>
                  <td className="tabular-nums">{l.queued}</td>
                  <td>{l.covered ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Covered</span> : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">No available operator</span>}</td>
                </tr>
              ))}
              {data && data.languages.length === 0 && <tr><td colSpan={4} className="py-3 text-slate-400">No open conversations.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operator languages</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.operators.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="flex items-center gap-2"><span className="font-medium text-slate-800">{o.name}</span><StatusPill status={o.status} /></div>
                {editing === o.id ? (
                  <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); save(o.id) }}>
                    <input aria-label={`Languages for ${o.name}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="en, es" className="w-28 rounded border border-slate-200 px-2 py-1 text-xs" />
                    <button className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white">Save</button>
                    <button type="button" onClick={() => setEditing(null)} className="text-xs text-slate-500">Cancel</button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    {o.languages.length === 0 ? <span className="text-xs text-slate-400">Any language</span> : o.languages.map((c) => <span key={c} title={LANGUAGE_NAMES[c] ?? c} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-indigo-700">{c}</span>)}
                    <button onClick={() => { setEditing(o.id); setDraft(o.languages.join(', ')) }} className="text-xs font-medium text-brand-600 hover:underline">Edit</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
