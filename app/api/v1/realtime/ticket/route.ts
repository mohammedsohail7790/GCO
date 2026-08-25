import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { signRealtimeTicket } from '@/lib/auth/tokens'
import { ok, handleRouteError } from '@/lib/api/response'

/**
 * Issues a short-lived (30s) one-time ticket for WebSocket authentication.
 *
 * The browser's real session lives in an httpOnly cookie (gco_at) by design,
 * so client-side JS cannot read it to pass as a WebSocket query param (the
 * only place a WS handshake can carry auth without a custom protocol). This
 * route reads the httpOnly cookie server-side (via getSession, same as any
 * other API route) and hands back a distinct, narrowly-scoped, very
 * short-lived ticket in the response BODY - which JS can read - for the sole
 * purpose of the immediately-following WS handshake. It carries the same
 * identity claims but a much shorter TTL and cannot be used against any REST
 * endpoint (see lib/auth/tokens.ts::signRealtimeTicket).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const ticket = await signRealtimeTicket({
      sub: session.sub,
      role: session.role,
      tenantId: session.tenantId,
      email: session.email,
    })
    return ok({ ticket })
  } catch (err) {
    return handleRouteError(err)
  }
}
