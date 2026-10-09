'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { StatusPill } from '@/components/ui/StatusPill'

type Status = 'NEW' | 'REVIEWING' | 'ACCEPTED' | 'REJECTED'
const STATUSES: Status[] = ['NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED']
const PILL: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700',
  REVIEWING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-slate-100 text-slate-500',
}

interface Application {
  id: string
  fullName: string
  email: string
  phone: string | null
  country: string | null
  languages: string | null
  message: string | null
  createdAt: string
  status: Status
  statusUpdatedAt: string | null
  reviewNote: string | null
  submissionCount: number
  lastSubmittedAt: string
}
interface Meta { total: number; page: number; pageSize: number; byStatus: Record<Status, number> }

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export default function CareerApplicationsPage() {
  const [items, setItems] = useState<Application[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'' | Status>('')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (query) params.set('q', query)
    if (status) params.set('status', status)
    return fetch(`/api/v1/admin/career-applications?${params}`, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`)
        setItems(json.data)
        setMeta(json.meta)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load applications'))
      .finally(() => setLoading(false))
  }, [page, query, status])

  useEffect(() => {
    load()
  }, [load])

  async function update(a: Application, next: Status) {
    try {
      await apiFetch(`/admin/career-applications/${a.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next, reviewNote: notes[a.id] ?? a.reviewNote ?? undefined }),
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update application')
    }
  }

  const pages = meta ? Math.max(Math.ceil(meta.total / meta.pageSize), 1) : 1

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Operator applications</h1>
          <p className="text-xs text-slate-500">Submissions from the public /careers page. Contains applicant personal data - CEO access only. Status changes are audit-logged.</p>
        </div>
        <Link href="/admin" className="text-sm font-medium text-brand-600 hover:underline">&larr; Executive dashboard</Link>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setStatus(''); setPage(1) }}
          className={`rounded-full px-3 py-1 text-xs font-medium ${status === '' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
        >
          All{meta ? ` (${STATUSES.reduce((n, s) => n + meta.byStatus[s], 0)})` : ''}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1) }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${status === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
          >
            {s.charAt(0) + s.slice(1).toLowerCase()}{meta ? ` (${meta.byStatus[s]})` : ''}
          </button>
        ))}
        <form
          className="ml-auto flex gap-2"
          onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); setPage(1) }}
        >
          <input
            aria-label="Search applications"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, country, language"
            maxLength={100}
            className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
          />
          <button type="submit" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Search</button>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {a.fullName} <span className="font-normal text-slate-500">&mdash; {a.email}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Applied {fmt(a.createdAt)}
                    {a.submissionCount > 1 && ` · resubmitted ${a.submissionCount - 1}× (last ${fmt(a.lastSubmittedAt)})`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[a.country, a.languages, a.phone].filter(Boolean).join(' · ') || 'No additional details'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={a.status} styles={PILL} />
                  <select
                    aria-label={`Status for ${a.fullName}`}
                    value={a.status}
                    onChange={(e) => update(a, e.target.value as Status)}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </select>
                  <button onClick={() => setOpen(open === a.id ? null : a.id)} className="text-xs font-medium text-brand-600 hover:underline">
                    {open === a.id ? 'Hide' : 'Details'}
                  </button>
                </div>
              </div>
              {open === a.id && (
                <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap text-xs text-slate-700">{a.message || 'No message.'}</p>
                  <label className="block text-xs font-medium text-slate-600" htmlFor={`note-${a.id}`}>Internal review note</label>
                  <textarea
                    id={`note-${a.id}`}
                    rows={2}
                    maxLength={2000}
                    defaultValue={a.reviewNote ?? ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                  />
                  <button onClick={() => update(a, a.status)} className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white">Save note</button>
                </div>
              )}
            </li>
          ))}
          {!loading && items.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-400">{query || status ? 'No applications match this filter.' : 'No applications yet.'}</li>
          )}
        </ul>
      </div>

      {meta && meta.total > meta.pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40">Previous</button>
          <span>Page {page} of {pages} &middot; {meta.total} results</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-md px-3 py-1 ring-1 ring-slate-200 disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
