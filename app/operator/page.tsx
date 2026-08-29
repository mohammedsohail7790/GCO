'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api/client'
import { useRealtime } from '@/lib/realtime/useRealtime'

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
  const low = seconds < 30
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
        expired ? 'bg-red-100 text-red-700' : low ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${expired ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      {expired ? 'Expired · reassigning' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
    </span>
  )
}

function Avatar({ label, tone = 'slate' }: { label: string; tone?: 'slate' | 'brand' }) {
  const initial = label.trim().charAt(0).toUpperCase() || '?'
  const toneClasses = tone === 'brand' ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClasses}`}>
      {initial}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'AVAILABLE' ? 'bg-emerald-500' : status === 'BUSY' ? 'bg-amber-500' : status === 'PAUSED' ? 'bg-slate-400' : 'bg-slate-300'
  return <span className={`h-2 w-2 rounded-full ${color}`} />
}

export default function OperatorPage() {
  const [status, setStatus] = useState<'OFFLINE' | 'AVAILABLE' | 'BUSY' | 'PAUSED'>('OFFLINE')
  const [operatorMeta, setOperatorMeta] = useState<{ operatorNumber: number; capacity: number } | null>(null)
  const [items, setItems] = useState<ConversationItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{
        operator: { status: string; operatorNumber: number; capacity: number }
        conversations: ConversationItem[]
      }>('/operators/me/workspace')
      setStatus(data.operator.status as any)
      setOperatorMeta({ operatorNumber: data.operator.operatorNumber, capacity: data.operator.capacity })
      setItems(data.conversations)
      if (!activeId && data.conversations[0]) setActiveId(data.conversations[0].conversation.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace')
    }
  }, [activeId])

  useEffect(() => {
    // Deliberate poll-on-mount-then-interval pattern - `load` sets state
    // asynchronously after its own fetch resolves, it does not set state
    // synchronously during this effect. This polling interval is the
    // unconditional fallback (see useRealtime below) and keeps running
    // regardless of WebSocket connectivity - the database stays authoritative.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load])

  // Accelerator only: a push notification just triggers an immediate refetch
  // via the same `load()` used by polling above - never trusted as data on
  // its own. If this never connects, polling above still drives everything.
  useRealtime(load, true)

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
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500">
            <span className="text-xs font-bold text-white">G</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900">GCO</span>
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <span className="text-sm text-slate-500">
            Operator {operatorMeta ? `#${operatorMeta.operatorNumber}` : ''}
          </span>
          {operatorMeta && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {items.length}/{operatorMeta.capacity} assigned
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <select
            value={status}
            onChange={(e) => setOperatorStatus(e.target.value as any)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            <option value="OFFLINE">Offline</option>
            <option value="AVAILABLE">Available</option>
            <option value="PAUSED">Paused</option>
          </select>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Queue sidebar */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">My conversations</h2>
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {items.length === 0 && (
              <li className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-sm text-slate-400">No active or queued conversations.</p>
              </li>
            )}
            {items.map((item) => {
              const lastMessage = item.conversation.messages[item.conversation.messages.length - 1]
              const isActive = activeId === item.conversation.id
              const awaitingReply = lastMessage?.direction === 'INBOUND'
              return (
                <li key={item.assignmentId} className="relative">
                  {isActive && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-500" />}
                  <button
                    onClick={() => setActiveId(item.conversation.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      isActive ? 'bg-brand-50/70 hover:bg-brand-50' : ''
                    }`}
                  >
                    <div className="relative shrink-0">
                      <Avatar label={item.conversation.externalUserId} />
                      {awaitingReply && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>
                          {item.conversation.externalUserId}
                        </span>
                      </div>
                      {lastMessage && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {lastMessage.direction === 'OUTBOUND' && <span className="text-slate-400">You: </span>}
                          {lastMessage.content}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          {item.conversation.state}
                        </span>
                        <Timer respondsBy={item.respondsBy} />
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* Conversation + AI suggestion */}
        <main className="flex flex-1 flex-col overflow-hidden bg-slate-50">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-700">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {error}
            </div>
          )}
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-400">
              <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-6l-4 4v-4z" />
              </svg>
              <p className="text-sm">
                {status !== 'AVAILABLE' ? 'Set your status to Available to receive conversations.' : 'No active conversation.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar label={active.conversation.externalUserId} tone="brand" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{active.conversation.externalUserId}</p>
                    <p className="text-xs text-slate-500">{active.conversation.state}</p>
                  </div>
                </div>
                <Timer respondsBy={active.respondsBy} />
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-6">
                {active.conversation.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-md">
                      <div
                        className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-card ${
                          m.direction === 'OUTBOUND'
                            ? 'rounded-br-sm bg-brand-500 text-white'
                            : 'rounded-bl-sm bg-white text-slate-900'
                        }`}
                      >
                        {m.content}
                      </div>
                      <p
                        className={`mt-1 text-[11px] text-slate-400 ${m.direction === 'OUTBOUND' ? 'text-right' : 'text-left'}`}
                      >
                        {m.direction === 'OUTBOUND' ? 'Sent by you' : 'Received'} ·{' '}
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {suggestion && (
                <div className="relative mx-6 mb-3 overflow-hidden rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-3.5 shadow-card">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                      </svg>
                      AI draft
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 ring-1 ring-inset ring-slate-200">
                        mock provider
                      </span>
                      {suggestion.confidence !== null && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
                          {(suggestion.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {suggestion.suggestedReply ? (
                    <>
                      <p className="text-sm leading-relaxed text-slate-700">{suggestion.suggestedReply}</p>
                      {suggestion.reasoningSummary && (
                        <p className="mt-1.5 text-xs italic text-slate-500">{suggestion.reasoningSummary}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">AI suggestion unavailable - respond manually.</p>
                  )}
                  <p className="mt-2.5 flex items-center gap-1.5 border-t border-brand-100/70 pt-2 text-[11px] text-brand-600">
                    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    Draft only — nothing is sent until you review and press Send below.
                  </p>
                </div>
              )}

              <div className="border-t border-slate-200 bg-white p-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder="Type or edit the reply…"
                  className="w-full resize-none rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="mt-2.5 flex items-center justify-between">
                  <p className="text-xs text-slate-400">Only you can send this — nothing goes out automatically.</p>
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                    )}
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

        {/* Context sidebar - hidden below xl so the conversation thread keeps
            comfortable width on a narrower shared screen; still fully
            reachable via the DOM/tests, purely a responsive display toggle. */}
        {active && (
          <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Extracted info
            </h3>
            {active.conversation.aiMemories.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">No extracted facts yet.</p>
            )}
            <ul className="space-y-1.5">
              {active.conversation.aiMemories.map((m) => (
                <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-700">{m.type}:</span> {m.value}
                </li>
              ))}
            </ul>
            <h3 className="mb-2 mt-5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
              </svg>
              Notes
            </h3>
            {active.conversation.notes.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">No notes.</p>
            )}
            <ul className="space-y-1.5">
              {active.conversation.notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {n.body}
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  )
}
