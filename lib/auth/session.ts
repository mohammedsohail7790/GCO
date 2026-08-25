import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { verifyAccessToken, type AccessTokenClaims } from './tokens'

export const ACCESS_COOKIE = 'gco_at'

export class UnauthorizedError extends Error {
  status = 401
}

/** Reads and verifies the caller's identity from the access-token cookie or Authorization header. */
export async function getSession(req?: NextRequest): Promise<AccessTokenClaims> {
  let token: string | undefined

  if (req) {
    token =
      req.cookies.get(ACCESS_COOKIE)?.value ??
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  } else {
    const cookieStore = await cookies()
    token = cookieStore.get(ACCESS_COOKIE)?.value
  }

  if (!token) throw new UnauthorizedError('No session token provided')

  try {
    return await verifyAccessToken(token)
  } catch {
    throw new UnauthorizedError('Invalid or expired session token')
  }
}

export async function tryGetSession(req?: NextRequest): Promise<AccessTokenClaims | null> {
  try {
    return await getSession(req)
  } catch {
    return null
  }
}
