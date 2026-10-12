'use client'

import { useState } from 'react'
import { apiFetch } from '@/lib/api/client'

/** Operator action: resolve (close) the conversation. Asks first; the server refuses while an escalation is open. */
export function ResolveButton({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resolve() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/conversations/${conversationId}/resolve`, { method: 'POST' })
      setConfirming(false)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve')
    } finally {
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
        Resolve
      </button>
    )
  }
  return (
    <span className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
      <span className="text-slate-600">Close this conversation?</span>
      <button disabled={busy} onClick={resolve} className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white disabled:opacity-50">{busy ? 'Closing…' : 'Yes, resolve'}</button>
      <button disabled={busy} onClick={() => { setConfirming(false); setError(null) }} className="text-slate-500">Cancel</button>
      {error && <span role="alert" className="text-red-600">{error}</span>}
    </span>
  )
}

/** Internal note form (never shown to the customer or the client). */
export function NoteForm({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/conversations/${conversationId}/notes`, { method: 'POST', body: JSON.stringify({ body }) })
      setBody('')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save note')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="mt-2 space-y-1.5">
      <textarea aria-label="Add an internal note" rows={2} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Internal note (not visible to the customer)" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
      <button disabled={busy || !body.trim()} className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40">{busy ? 'Saving…' : 'Add note'}</button>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
