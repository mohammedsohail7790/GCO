'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Mod { id: string; title: string; kind: 'MATERIAL' | 'TEST'; required: boolean; passMarkPercent: number; tenantId: string | null }
interface Row { operatorId: string; number: number; name: string; completed: number; total: number; requiredOutstanding: string[]; failedTests: { title: string; score: number | null }[]; qualifications: { id: string; kind: string; serviceType: string | null; language: string | null }[] }

// One question per line:  Question text? | option A | option B* | option C     (an asterisk marks the correct option)
function parseQuestions(text: string) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [q, ...opts] = line.split('|').map((x) => x.trim())
    const correct = opts.findIndex((o) => o.endsWith('*'))
    return { q: q ?? '', options: opts.map((o) => o.replace(/\*$/, '').trim()), correct }
  })
}

/** Training modules, tests, assignment, progress and qualifications for a client's operators (team-limited for supervisors). */
export function TrainingPanel({ tenantId, canApprove = true }: { tenantId?: string; canApprove?: boolean }) {
  const q = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''
  const [mods, setMods] = useState<Mod[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [needsApproval, setNeedsApproval] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [f, setF] = useState({ title: '', kind: 'MATERIAL', body: '', questions: '', pass: '80', required: false })
  const [assign, setAssign] = useState({ moduleId: '', operatorId: '' })

  const load = useCallback(
    () =>
      Promise.all([apiFetch<Mod[]>(`/training/modules${q}`), apiFetch<{ requireOperatorApproval: boolean; operators: Row[] }>(`/training/overview${q}`)])
        .then(([m, o]) => { setMods(m); setRows(o.operators); setNeedsApproval(o.requireOperatorApproval) })
        .catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to load training' })),
    [q],
  )
  useEffect(() => { load() }, [load])
  const act = (fn: () => Promise<unknown>, ok: string) => fn().then(() => { setMsg({ kind: 'ok', text: ok }); return load() }).catch((e) => setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Failed' }))

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Training and qualifications</h2></div>
      {msg && <p className={`px-4 py-2 text-sm ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
      <div className="space-y-4 p-4">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); act(() => apiFetch('/training/modules', { method: 'POST', body: JSON.stringify({ ...(tenantId ? { tenantId } : {}), title: f.title, kind: f.kind, body: f.body, required: f.required, passMarkPercent: Number(f.pass), ...(f.kind === 'TEST' ? { questions: parseQuestions(f.questions) } : {}) }) }).then(() => setF({ ...f, title: '', body: '', questions: '' })), 'Module created.') }}>
          <div className="grid gap-2 sm:grid-cols-4">
            <input required minLength={3} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Module title" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2" />
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="MATERIAL">Reading material</option><option value="TEST">Test</option></select>
            <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} /> Required before going available</label>
          </div>
          <textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Instructions / material text" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          {f.kind === 'TEST' && <>
            <textarea rows={4} value={f.questions} onChange={(e) => setF({ ...f, questions: e.target.value })} placeholder={'One question per line:\nCan an operator share another client\'s data? | Yes | No* | Only if asked nicely'} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs" />
            <label className="text-sm text-slate-600">Pass mark % <input type="number" min={1} max={100} value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} className="ml-1 w-16 rounded border border-slate-300 px-2 py-1" /></label>
          </>}
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Create module</button>
        </form>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={assign.moduleId} onChange={(e) => setAssign({ ...assign, moduleId: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5"><option value="">Assign module…</option>{mods.map((m) => <option key={m.id} value={m.id}>{m.title}{m.required ? ' (required)' : ''}</option>)}</select>
          <select value={assign.operatorId} onChange={(e) => setAssign({ ...assign, operatorId: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5"><option value="">to operator…</option>{rows.map((r) => <option key={r.operatorId} value={r.operatorId}>#{r.number} {r.name}</option>)}</select>
          <button disabled={!assign.moduleId || !assign.operatorId} onClick={() => act(() => apiFetch(`/training/modules/${assign.moduleId}/assign`, { method: 'POST', body: JSON.stringify({ operatorIds: [assign.operatorId] }) }), 'Assigned.')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Assign</button>
          <span className="ml-auto text-xs text-slate-500">Client approval required before going available: <b>{needsApproval ? 'yes' : 'no'}</b></span>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-400"><tr><th className="py-1">Operator</th><th>Progress</th><th>Outstanding required</th><th>Qualifications</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-slate-400">No operators in scope.</td></tr>}
            {rows.map((r) => (
              <tr key={r.operatorId} className="border-t border-slate-100 align-top">
                <td className="py-1.5 font-medium text-slate-900">#{r.number} {r.name}</td>
                <td>{r.completed}/{r.total}{r.failedTests.length > 0 && <span className="ml-2 text-xs text-red-600">failed: {r.failedTests.map((t) => `${t.title} (${t.score}%)`).join(', ')}</span>}</td>
                <td className={r.requiredOutstanding.length ? 'text-amber-700' : 'text-slate-400'}>{r.requiredOutstanding.join(', ') || 'none'}</td>
                <td>{r.qualifications.map((qq) => <span key={qq.id} className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{qq.kind === 'CLIENT_APPROVAL' ? 'Approved for client' : qq.kind === 'SERVICE' ? (qq.serviceType ?? '').toLowerCase().replace(/_/g, ' ') : `Language ${qq.language}`}<button title="Revoke" onClick={() => act(() => apiFetch('/training/qualifications', { method: 'DELETE', body: JSON.stringify({ id: qq.id }) }), 'Revoked.')} className="text-emerald-900">×</button></span>)}</td>
                <td className="text-right">{canApprove && !r.qualifications.some((x) => x.kind === 'CLIENT_APPROVAL') && <button onClick={() => act(() => apiFetch('/training/qualifications', { method: 'POST', body: JSON.stringify({ operatorId: r.operatorId, kind: 'CLIENT_APPROVAL' }) }), 'Operator approved for this client.')} className="text-xs font-medium text-brand-600 hover:underline">Approve for client</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
