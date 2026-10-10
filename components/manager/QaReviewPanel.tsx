'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { languageLabel, normalizeLanguage } from '@/lib/languages'

interface QueueItem { messageId: string; customer: string; language: string | null; customerMessage: string | null; reply: string; operatorName: string | null; sentAt: string }
interface Summary { totalReviews: number; pendingReview: number; operators: { operatorId: string; operatorName: string; reviews: number; accuracy: number | null; tone: number | null; resolution: number | null; pass: number; coaching: number; fail: number }[] }
const FLAGS: { key: string; label: string }[] = [
  { key: 'accuracy', label: 'Inaccurate' }, { key: 'tone', label: 'Tone' }, { key: 'policy', label: 'Policy' },
  { key: 'no_resolution', label: 'No resolution' }, { key: 'language', label: 'Wrong language' },
]
type Scores = { accuracy: number; tone: number; resolution: number }

// Supervisors score sent replies on three 1-5 criteria. The summary below is computed only from submitted reviews -
// nothing here is automatic or AI-scored.
export function QaReviewPanel() {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [scores, setScores] = useState<Record<string, Scores>>({})
  const [flags, setFlags] = useState<Record<string, string[]>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    apiFetch<QueueItem[]>('/qa/queue').then(setQueue).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
    apiFetch<Summary>('/qa/summary').then(setSummary).catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const id = setInterval(load, 10000)
    return () => clearInterval(id)
  }, [load])

  const sc = (id: string): Scores => scores[id] ?? { accuracy: 0, tone: 0, resolution: 0 }
  const ready = (id: string) => sc(id).accuracy > 0 && sc(id).tone > 0 && sc(id).resolution > 0

  async function submit(item: QueueItem) {
    try {
      await apiFetch('/qa/reviews', { method: 'POST', body: JSON.stringify({ messageId: item.messageId, ...sc(item.messageId), flags: flags[item.messageId] ?? [], note: notes[item.messageId] || undefined }) })
      setError(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review')
    }
  }

  const Rating = ({ id, field, label }: { id: string; field: keyof Scores; label: string }) => (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <span className="w-20">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} aria-label={`${label} ${n}`} aria-pressed={sc(id)[field] === n} onClick={() => setScores((s) => ({ ...s, [id]: { ...sc(id), [field]: n } }))}
          className={`h-6 w-6 rounded-full border text-xs font-medium ${sc(id)[field] === n ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{n}</button>
      ))}
    </div>
  )

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card" aria-labelledby="qa-title">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 id="qa-title" className="text-sm font-semibold text-slate-900">Quality review</h2>
          <p className="text-xs text-slate-500">Score sent replies on accuracy, tone and resolution. Scores are entered by supervisors only.</p>
        </div>
        {summary && <p className="text-xs text-slate-500">{summary.pendingReview} awaiting review &middot; {summary.totalReviews} reviewed (30 days)</p>}
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-xs text-red-600">{error}</p>}
      <div className="grid gap-6 p-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          {queue.map((q) => (
            <article key={q.messageId} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="text-xs text-slate-500">
                {q.customer}{normalizeLanguage(q.language) && <> &middot; {languageLabel(q.language)}</>} &middot; replied by {q.operatorName ?? 'operator'}
              </p>
              {q.customerMessage && <p className="mt-2 rounded bg-slate-50 px-2.5 py-1.5 text-slate-700"><span className="text-xs font-medium text-slate-400">Customer: </span>{q.customerMessage}</p>}
              <p className="mt-1.5 rounded bg-indigo-50/60 px-2.5 py-1.5 text-slate-800"><span className="text-xs font-medium text-indigo-400">Reply: </span>{q.reply}</p>
              <div className="mt-3 space-y-1.5">
                <Rating id={q.messageId} field="accuracy" label="Accuracy" />
                <Rating id={q.messageId} field="tone" label="Tone" />
                <Rating id={q.messageId} field="resolution" label="Resolution" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FLAGS.map((f) => {
                  const on = (flags[q.messageId] ?? []).includes(f.key)
                  return <button key={f.key} aria-pressed={on} onClick={() => setFlags((s) => ({ ...s, [q.messageId]: on ? (s[q.messageId] ?? []).filter((x) => x !== f.key) : [...(s[q.messageId] ?? []), f.key] }))} className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-amber-300 bg-amber-100 text-amber-800' : 'border-slate-200 text-slate-500'}`}>{f.label}</button>
                })}
              </div>
              <textarea aria-label="Coaching note" rows={2} maxLength={2000} placeholder="Coaching note (optional)" value={notes[q.messageId] ?? ''} onChange={(e) => setNotes((s) => ({ ...s, [q.messageId]: e.target.value }))} className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <button disabled={!ready(q.messageId)} onClick={() => submit(q)} className="mt-2 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">Submit review</button>
            </article>
          ))}
          {queue.length === 0 && <p className="text-sm text-slate-400">No sent replies waiting for review.</p>}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Operator scores (last 30 days)</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Operator</th><th>Reviews</th><th>Acc.</th><th>Tone</th><th>Res.</th><th>Pass / Coach / Fail</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {summary?.operators.map((o) => (
                <tr key={o.operatorId}><td className="py-1.5 font-medium text-slate-800">{o.operatorName}</td><td className="tabular-nums">{o.reviews}</td><td className="tabular-nums">{o.accuracy}</td><td className="tabular-nums">{o.tone}</td><td className="tabular-nums">{o.resolution}</td><td className="tabular-nums">{o.pass} / {o.coaching} / {o.fail}</td></tr>
              ))}
              {summary && summary.operators.length === 0 && <tr><td colSpan={6} className="py-3 text-slate-400">No reviews yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
