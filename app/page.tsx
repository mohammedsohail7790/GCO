import { redirect } from 'next/navigation'
import { tryGetSession } from '@/lib/auth/session'

const ROLE_HOME: Record<string, string> = {
  CEO_ADMIN: '/admin',
  MANAGER: '/manager',
  ASSISTANT: '/manager',
  OPERATOR: '/operator',
  CLIENT: '/client-panel',
}

export default async function Home() {
  const session = await tryGetSession()
  if (!session) redirect('/login')
  redirect(ROLE_HOME[session.role] ?? '/login')
}
