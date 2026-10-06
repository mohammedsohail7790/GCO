'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

// Public. The one-time token lives in the URL FRAGMENT (#token=...), which browsers never send to servers,
// proxies or Referer headers. It is read once, removed from the address bar, and posted over HTTPS.
// Remembered once read, because the fragment is removed from the address bar right after.
let cachedToken: string | null = null
function readToken(): string {
  const found = window.location.hash.match(/token=([0-9a-f]{64})/)?.[1]
  if (found) cachedToken = found
  return cachedToken ?? ''
}
// A hash-only navigation (pasting the link into the already-open tab) does not reload the page.
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export default function AcceptInvitationPage() {
  const token = useSyncExternalStore(subscribe, readToken, () => null) // null during SSR/hydration
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (token && window.location.hash) history.replaceState(null, '', window.location.pathname) // never leave the token in the address bar
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) return setError('Use at least 10 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setLoading(true)
    try {
      const res = await fetch('/api/v1/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Something went wrong. Please try again.')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const field = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Set up your GCO login</h1>
        {token === null ? null : done ? (
          <div className="mt-4" role="status">
            <p className="text-sm text-slate-600">Your password is set. You can now sign in.</p>
            <Link href="/login" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">Go to sign in</Link>
          </div>
        ) : token === '' ? (
          <p className="mt-4 text-sm text-slate-600" role="alert">This invitation link is missing or incomplete. Please use the full link you were sent, or ask your GCO contact for a new one.</p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-4">
            <p className="text-sm text-slate-500">Choose a password for your client workspace.</p>
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <label className="block text-sm font-medium text-slate-700">
              New password
              <input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              <span className="mt-1 block text-xs font-normal text-slate-500">At least 10 characters.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Repeat password
              <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
            </label>
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60">
              {loading ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
