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
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttlMinutes}m`)
    .sign(getSecret())
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as AccessTokenClaims
}
