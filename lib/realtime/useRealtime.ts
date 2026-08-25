'use client'

import { useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api/client'

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'ws://localhost:3001'

/**
 * Subscribes to the realtime push server as an ACCELERATOR for a dashboard
 * that already polls the REST API on its own interval. `onEvent` is called
 * with no payload - the correct reaction is always "refetch now", never
 * "trust this message's contents", because:
 *
 *  - duplicate delivery is possible (Redis pub/sub, reconnects) - refetching
 *    is idempotent, so duplicates are harmless.
 *  - missed events are possible (server restart, brief disconnect) - since
 *    the polling fallback below still runs unconditionally, a missed push
 *    is caught by the next poll tick at worst.
 *  - the database remains the single source of truth throughout.
 *
 * If the WebSocket never connects (server down, blocked by network policy,
 * etc.) this hook fails silently and the caller's existing polling interval
 * is the only thing driving updates - by design, not a fallback path that
 * needs separate wiring.
 */
export function useRealtime(onEvent: () => void, enabled: boolean) {
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!enabled) return

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let attempt = 0

    async function connect() {
      if (cancelled) return
      try {
        const { ticket } = await apiFetch<{ ticket: string }>('/realtime/ticket')
        if (cancelled) return

        socket = new WebSocket(`${REALTIME_URL}?token=${encodeURIComponent(ticket)}`)

        socket.onmessage = () => {
          onEventRef.current()
        }

        socket.onopen = () => {
          attempt = 0
        }

        socket.onclose = () => {
          if (cancelled) return
          // Exponential backoff, capped at 30s - a ticket is single-use and
          // 30s TTL, so each reconnect attempt fetches a fresh one.
          const delay = Math.min(30_000, 1000 * 2 ** attempt)
          attempt += 1
          reconnectTimer = setTimeout(connect, delay)
        }

        socket.onerror = () => {
          socket?.close()
        }
      } catch {
        // Ticket fetch failed (e.g. session expired) - the caller's polling
        // fallback keeps the dashboard functional regardless; just retry later.
        if (!cancelled) reconnectTimer = setTimeout(connect, 10_000)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [enabled])
}
