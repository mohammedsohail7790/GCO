'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Mod { id: string; title: string; kind: 'MATERIAL' | 'TEST'; body: string; required: boolean; passMarkPercent: number; questions: { q: string; options: string[] }[] | null; status: 'ASSIGNED' | 'COMPLETED' | 'FAILED'; score: number | null; attempts: number }
interface Data { modules: Mod[]; gate: { cleared: boolean; missingModules: string[]; needsApproval: boolean }; qualifications: { id: string; kind: string; serviceType: string | null; language: string | null }[] }

export default function OperatorTrainingPage() {
  const [data, setData] = useState<Data | null>(null)
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => apiFetch<Data>('/operators/me/training').then(setData).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed to load')), [])
  useEffect(() => { load() }, [load])

  const read = (id: string) => apiFetch(`/operators/me/training/${id}/complete`, { method: 'POST', body: '{}' }).then(load).catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))
  const submit = (m: Mod) => apiFetch<{ score: number; passed: boolean; passMarkPercent: number }>(`/operators/me/training/${m.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: (m.questions ?? []).map((_, i) => answers[m.id]?.[i] ?? -1).map((x) => (x < 0 ? 99 : x)).map((x) => Math.min(x, 10)) }) })
    .then((r) => { setMsg(r.passed ? `Passed with ${r.score}%.` : `${r.score}% - the pass mark is ${r.passMarkPercent}%. You can try again.`); return load() })
    .catch((e) => setMsg(e instanceof Error ? e.message : 'Failed'))

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <span className="text-sm font-semibold text-slate-900">My training</span>
        <a href="/operator" className="text-xs font-medium text-brand-600 hover:underline">Back to conversations</a>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        {msg && <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{msg}</p>}
        {data && !data.gate.cleared && <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">You cannot take conversations yet. {data.gate.missingModules.length > 0 && <>Complete: {data.gate.missingModules.join(', ')}. </>}{data.gate.needsApproval && 'Your manager still needs to approve you for this client.'}</p>}
        {data && data.qualifications.length > 0 && <p className="text-sm text-slate-600">Qualifications: {data.qualifications.map((q) => (q.kind === 'CLIENT_APPROVAL' ? 'approved for client' : q.kind === 'SERVICE' ? (q.serviceType ?? '').toLowerCase().replace(/_/g, ' ') : `language ${q.language}`)).join(' · ')}</p>}
        {data?.modules.length === 0 && <p className="text-sm text-slate-400">Nothing assigned.</p>}
        {data?.modules.map((m) => (
          <section key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">{m.title}{m.required && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">required</span>}</h2><span className={`text-xs font-medium ${m.status === 'COMPLETED' ? 'text-emerald-600' : m.status === 'FAILED' ? 'text-red-600' : 'text-slate-500'}`}>{m.status === 'COMPLETED' ? `Completed${m.score !== null ? ` · ${m.score}%` : ''}` : m.status === 'FAILED' ? `Not passed (${m.score}%, ${m.attempts} attempt${m.attempts === 1 ? '' : 's'})` : 'To do'}</span></div>
            {m.body && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>}
            {m.status !== 'COMPLETED' && m.kind === 'MATERIAL' && <button onClick={() => read(m.id)} className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">I have read this</button>}
            {m.status !== 'COMPLETED' && m.kind === 'TEST' && m.questions && (
              <div className="mt-3 space-y-3">
                {m.questions.map((q, i) => (
                  <fieldset key={i} className="text-sm"><legend className="font-medium text-slate-800">{i + 1}. {q.q}</legend>{q.options.map((o, j) => <label key={j} className="mr-4 inline-flex items-center gap-1"><input type="radio" name={`${m.id}-${i}`} checked={answers[m.id]?.[i] === j} onChange={() => setAnswers({ ...answers, [m.id]: Object.assign([...(answers[m.id] ?? [])], { [i]: j }) })} />{o}</label>)}</fieldset>
                ))}
                <button onClick={() => submit(m)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Submit answers (pass mark {m.passMarkPercent}%)</button>
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  )
}
