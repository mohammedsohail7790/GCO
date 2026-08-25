import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// Edge-safe route gate. This is a UX convenience (fast redirect to /login,
// coarse role routing) - it is NOT the security boundary. Every API route
// re-verifies the token and re-checks permissions server-side regardless of
// what middleware decided, per spec section 55 ("backend must enforce every
// permission").

const ROLE_PREFIXES: Record<string, string[]> = {
  '/admin': ['CEO_ADMIN'],
  '/manager': ['MANAGER', 'ASSISTANT', 'CEO_ADMIN'],
  '/operator': ['OPERATOR'],
  '/client-panel': ['CLIENT'],
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const protectedPrefix = Object.keys(ROLE_PREFIXES).find((p) => pathname.startsWith(p))
  if (!protectedPrefix) return NextResponse.next()

  const token = req.cookies.get('gco_at')?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    const { payload } = await jwtVerify(token, secret)
    const role = payload.role as string
    if (!ROLE_PREFIXES[protectedPrefix]!.includes(role)) {
      return NextResponse.redirect(new URL('/', req.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/manager/:path*', '/operator/:path*', '/client-panel/:path*'],
}
