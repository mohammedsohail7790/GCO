'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Message {
  id: string
  direction: 'INBOUND' | 'OUTBOUND'
  content: string
  status: string
  createdAt: string
}

interface ConversationItem {
  assignmentId: string
  respondsBy: string
  assignedAt: string
  conversation: {
    id: string
    externalUserId: string
    state: string
    messages: Message[]
    notes: { id: string; body: string; createdAt: string }[]
    aiMemories: { id: string; type: string; value: string; confidence: number }[]
  }
}

interface Suggestion {
  id: string
  suggestedReply: string | null
  language: string | null
  confidence: number | null
  reasoningSummary: string | null
  flags: string[]
  status: string
}

function Timer({ respondsBy }: { respondsBy: string }) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, new Date(respondsBy).getTime() - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [respondsBy])
  const seconds = Math.floor(remaining / 1000)
  const expired = remaining <= 0
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${expired ? 'bg-red-100 text-red-700' : seconds < 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
      {expired ? 'Expired - reassigning' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
    </span>
  )
}

export default function OperatorPage() {
  const [status, setStatus] = useState<'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'PAUSED'>('OFFLINE')
  const [items, setItems] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ operator: { status: string }; conversations: ConversationItem[] }>(
        '/operators/me/workspace',
      )
      setStatus(data.operator.status as any)
      setItems(data.conversations)
      if (!activeId && data.conversations[0]) setActiveId(data.conversations[0].conversation.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace')
    }
  }, [activeId])

  useEffect(() => {
    // Deliberate poll-on-mount-then-interval pattern (WS upgrade path is documented
    // separately) - `load` sets state asynchronously after its own fetch resolves,
    // it does not set state synchronously during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  const active = items.find((i) => i.conversation.id === activeId) ?? null

  useEffect(() => {
    if (!active) return
    apiFetch<{ generation: Suggestion | null }>(`/conversations/${active.conversation.id}/suggestion`)
      .then((d) => {
        setSuggestion(d.generation)
        setDraft(d.generation?.suggestedReply ?? '')
      })
      .catch(() => setSuggestion(null))
    // Intentionally keyed on the conversation id only, not the whole `active`
    // object - `active` is re-derived every 5s poll tick, and re-running this
    // on every poll would overwrite the operator's in-progress draft edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.conversation.id])

  async function setOperatorStatus(next: typeof status) {
    setStatus(next)
    await apiFetch('/operators/me/status', { method: 'PATCH', body: JSON.stringify({ status: next }) })
    load()
  }

  async function handleSend() {
    if (!active || !draft.trim()) return
    setSending(true)
    setError(null)
    try {
      await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: active.conversation.id,
          content: draft,
          aiGenerationId: suggestion?.id ?? null,
        }),
      })
      setDraft('')
      setSuggestion(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Queue sidebar */}
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">My conversations</h2>
          <select
            value={status}
            onChange={(e) => setOperatorStatus(e.target.value as any)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="OFFLINE">Offline</option>
            <option value="AVAILABLE">Available</option>
            <option value="PAUSED">Paused</option>
          </select>
        </div>
        <ul className="divide-y divide-slate-100 overflow-y-auto">
          {items.length === 0 && <li className="p-4 text-sm text-slate-400">No active or queued conversations.</li>}
          {items.map((item) => (
            <li key={item.assignmentId}>
              <button
                onClick={() => setActiveId(item.conversation.id)}
                className={`flex w-full flex-col gap-1 p-4 text-left hover:bg-slate-50 ${activeId === item.conversation.id ? 'bg-brand-50' : ''}`}
              >
                <span className="text-sm font-medium text-slate-900">{item.conversation.externalUserId}</span>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{item.conversation.state}</span>
                  <Timer respondsBy={item.respondsBy} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation + AI suggestion */}
      <main className="flex flex-1 flex-col">
        {error && <div className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!active ? (
          <div className="flex flex-1 items-center justify-center text-slate-400">
            {status !== 'AVAILABLE' ? 'Set your status to Available to receive conversations.' : 'No active conversation.'}
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto p-6">
              {active.conversation.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-md rounded-lg px-3 py-2 text-sm ${m.direction === 'OUTBOUND' ? 'bg-brand-500 text-white' : 'bg-white text-slate-900 shadow-sm'}`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            {suggestion && (
              <div className="mx-6 mb-2 rounded-lg border border-brand-100 bg-brand-50 p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-brand-700">
                  <span className="font-semibold">AI suggestion</span>
                  {suggestion.confidence !== null && <span>confidence {(suggestion.confidence * 100).toFixed(0)}%</span>}
                </div>
                {suggestion.suggestedReply ? (
                  <>
                    <p className="text-sm text-slate-700">{suggestion.suggestedReply}</p>
                    {suggestion.reasoningSummary && (
                      <p className="mt-1 text-xs italic text-slate-500">{suggestion.reasoningSummary}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">AI suggestion unavailable - respond manually.</p>
                )}
              </div>
            )}

            <div className="border-t border-slate-200 bg-white p-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Type or edit the reply…"
                className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Context sidebar */}
      {active && (
        <aside className="w-72 shrink-0 border-l border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Extracted info</h3>
          {active.conversation.aiMemories.length === 0 && <p className="text-xs text-slate-400">No extracted facts yet.</p>}
          <ul className="space-y-1">
            {active.conversation.aiMemories.map((m) => (
              <li key={m.id} className="text-xs text-slate-600">
                <span className="font-medium">{m.type}:</span> {m.value}
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-900">Notes</h3>
          {active.conversation.notes.length === 0 && <p className="text-xs text-slate-400">No notes.</p>}
          <ul className="space-y-1">
            {active.conversation.notes.map((n) => (
              <li key={n.id} className="text-xs text-slate-600">{n.body}</li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  )
}
