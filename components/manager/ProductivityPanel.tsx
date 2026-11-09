'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Row { operatorId: string; operatorNumber: number; name: string; replies: number; repliesWithDraft: number; medianReplySeconds: number | null; moderatedItems: number; scheduledHours: number; repliesPerScheduledHour: number | null }
interface Report {
  operators: Row[]
  totals: { replies: number; completedTickets: number; moderatedItems: number; medianReplySecondsWithDraft: number | null; medianReplySecondsWithoutDraft: number | null; secondsSavedPerReply: number | null }
  aiDrafts: { generated: number; usedUnchanged: number; edited: number; notUsed: number; failed: number }
}

const secs = (s: number | null) => (s === null ? '–' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 6) / 10} min`)

/** Last 7 days: replies, completed tickets, moderated items, reply times and the measured effect of AI drafts. */
export function ProductivityPanel({ tenantId }: { tenantId?: string }) {
  const [r, setR] = useState<Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    apiFetch<Report>(`/reports/productivity${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`).then(setR).catch((e) => setErr(e instanceof Error ? e.message : 'Failed to load'))
  }, [tenantId])

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white shadow-card" data-testid="productivity-panel">
      <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-900">Productivity, last 7 days</h2></div>
      {err && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{err}</p>}
      {r && (
        <div className="p-4">
          <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
            <p><span className="block text-xs text-slate-500">Replies</span>{r.totals.replies}</p>
            <p><span className="block text-xs text-slate-500">Completed tickets</span>{r.totals.completedTickets}</p>
            <p><span className="block text-xs text-slate-500">Moderated items</span>{r.totals.moderatedItems}</p>
            <p><span className="block text-xs text-slate-500">Time saved per reply with an AI draft</span>{r.totals.secondsSavedPerReply === null ? 'Not enough data yet' : secs(r.totals.secondsSavedPerReply)}</p>
          </div>
          <p className="mb-3 text-xs text-slate-500">Median reply time with a draft {secs(r.totals.medianReplySecondsWithDraft)}, without {secs(r.totals.medianReplySecondsWithoutDraft)}. AI drafts: {r.aiDrafts.generated} prepared, {r.aiDrafts.usedUnchanged} used unchanged, {r.aiDrafts.edited} edited, {r.aiDrafts.notUsed} not used, {r.aiDrafts.failed} failed.</p>
          {r.operators.length === 0 ? <p className="text-sm text-slate-400">No operators.</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Operator</th><th>Replies</th><th>With draft</th><th>Median reply</th><th>Moderated</th><th>Scheduled h</th><th>Replies / h</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{r.operators.map((o) => <tr key={o.operatorId}><td className="py-1">#{o.operatorNumber} {o.name}</td><td>{o.replies}</td><td>{o.repliesWithDraft}</td><td>{secs(o.medianReplySeconds)}</td><td>{o.moderatedItems}</td><td>{o.scheduledHours}</td><td>{o.repliesPerScheduledHour ?? '–'}</td></tr>)}</tbody>
            </table></div>
          )}
        </div>
      )}
    </section>
  )
}
