import { SignJWT, jwtVerify } from 'jose'
import type { Role } from '@prisma/client'

export interface AccessTokenClaims {
  sub: string // userId
  role: Role
  tenantId: string | null
  email: string
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET is not configured (set a long random value in .env)')
  }
  return new TextEncoder().encode(secret)
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const ttlMinutes = parseInt(process.env.AUTH_TOKEN_TTL_MINUTES ?? '60', 10)
  return new SignJWT({ ...claims, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlMinutes}m`)
    .sign(getSecret())
}

/** Rejects tokens minted for a different purpose (e.g. a realtime ticket) - see signRealtimeTicket. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  if ((payload as any).typ && (payload as any).typ !== 'access') {
    throw new Error('Not an access token')
  }
  return payload as unknown as AccessTokenClaims
}

/**
 * A distinct, very short-lived (30s) token whose only valid use is
 * authenticating a WebSocket handshake (see app/api/v1/realtime/ticket/route.ts
 * and workers/realtime-server.ts). Deliberately NOT accepted by
 * verifyAccessToken - a leaked/logged realtime ticket (e.g. in a WS URL,
 * which is more likely to end up in server access logs than a header) must
 * not be usable to call any REST endpoint.
 */
export async function signRealtimeTicket(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ ...claims, typ: 'realtime' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(getSecret())
}

export async function verifyRealtimeTicket(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  if ((payload as any).typ !== 'realtime') {
    throw new Error('Not a realtime ticket')
  }
  return payload as unknown as AccessTokenClaims
}
