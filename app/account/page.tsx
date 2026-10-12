'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Me { email: string; role: string; displayName?: string }

// Shared account page for every role: shows who you are and lets you change your own password.
export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { apiFetch<{ user?: Me } & Partial<Me>>('/auth/me').then((d) => setMe((d.user ?? d) as Me)).catch(() => setSignedOut(true)) }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (next !== again) { setMsg({ ok: false, text: 'The new passwords do not match.' }); return }
    setBusy(true)
    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) })
      setCurrent(''); setNext(''); setAgain('')
      setMsg({ ok: true, text: 'Password changed. Your other sessions were signed out.' })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change password' })
    } finally { setBusy(false) }
  }

  if (signedOut) return <main className="p-8"><p className="text-sm text-slate-600">You are signed out. <Link className="font-medium text-brand-600 underline" href="/login">Sign in</Link></p></main>
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold text-slate-900">Your account</h1>
      {me && <p className="mt-1 text-sm text-slate-500">{me.email} · {me.role.replace(/_/g, ' ').toLowerCase()}</p>}
      <form onSubmit={submit} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        <label className="block text-xs font-medium text-slate-600">Current password
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">New password (12+ characters)
          <input type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-slate-600">Repeat new password
          <input type="password" autoComplete="new-password" required minLength={12} value={again} onChange={(e) => setAgain(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</p>}
        <button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Saving…' : 'Change password'}</button>
      </form>
      <p className="mt-4 text-xs text-slate-400">Two-factor sign-in and emailed password reset are not available yet.</p>
    </main>
  )
}
