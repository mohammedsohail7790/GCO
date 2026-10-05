import { redirect } from 'next/navigation'
import { tryGetSession } from '@/lib/auth/session'

// Authenticated landing redirect. This used to live on the public homepage ("/"),
// which forced the marketing page to read the session cookie and therefore render
// dynamically (never cacheable). It now lives here so "/" can be fully static;
// login and the middleware role gate send people to /home, which routes them to
// their role's dashboard exactly as "/" used to. Unauthenticated -> /login.
const ROLE_HOME: Record<string, string> = {
  CEO_ADMIN: '/admin',
  MANAGER: '/manager',
  ASSISTANT: '/manager',
  OPERATOR: '/operator',
  CLIENT: '/client-panel',
  HUNTER: '/hunter',
}

export default async function AppHome() {
  const session = await tryGetSession()
  redirect(session ? (ROLE_HOME[session.role] ?? '/login') : '/login')
}
