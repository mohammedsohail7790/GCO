'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'

interface Status { enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number }
interface Setup { secret: string; otpauthUri: string }

// Two-factor sign-in (authenticator app). Optional per account; every change asks for the current password again.
export function TwoFactorSection() {
  const [status, setStatus] = useState<Status | null>(null)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { apiFetch<Status>('/auth/2fa/status').then(setStatus).catch(() => undefined) }, [])
  useEffect(load, [load])

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true); setMsg(null)
    try { return await fn() } catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong'); return null } finally { setBusy(false) }
  }
  const post = <T,>(path: string, body: object) => apiFetch<T>(`/auth/2fa/${path}`, { method: 'POST', body: JSON.stringify(body) })

  async function start() {
    const r = await run(() => post<Setup>('setup', { password }))
    if (r) { setSetup(r); setPassword('') }
  }
  async function enable() {
    const r = await run(() => post<{ recoveryCodes: string[] }>('enable', { password: passwordForConfirm, code }))
    if (r) { setCodes(r.recoveryCodes); setSetup(null); setCode(''); setPasswordForConfirm(''); load() }
  }
  const [passwordForConfirm, setPasswordForConfirm] = useState('')
  async function turnOff() {
    const r = await run(() => post('disable', { password }))
    if (r) { setPassword(''); setCodes(null); load(); setMsg('Two-factor sign-in is off.') }
  }
  async function regen() {
    const r = await run(() => post<{ recoveryCodes: string[] }>('recovery-codes', { password }))
    if (r) { setCodes(r.recoveryCodes); setPassword(''); load() }
  }

  const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
  return (
    <section className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card" aria-labelledby="tfa">
      <div className="flex items-center justify-between">
        <h2 id="tfa" className="text-sm font-semibold text-slate-900">Two-factor sign-in</h2>
        {status && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{status.enabled ? 'On' : 'Off'}</span>}
      </div>
      <p className="text-xs text-slate-500">Adds a code from an authenticator app (Google Authenticator, 1Password, Authy…) after your password. Recommended for admin accounts.</p>

      {codes && (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">Save these recovery codes now. Each works once if you lose your phone, and they will not be shown again.</p>
          <ul data-testid="recovery-codes" className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm text-slate-900">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button onClick={() => setCodes(null)} className="mt-2 text-xs font-medium text-amber-900 underline">I have saved them</button>
        </div>
      )}

      {status && !status.enabled && !setup && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">Current password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          <button disabled={busy || !password} onClick={start} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Set up two-factor</button>
        </div>
      )}

      {setup && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">1. In your authenticator app choose “Enter a setup key” (or <a className="font-medium text-brand-600 underline" href={setup.otpauthUri}>open it directly on your phone</a>) and type this key:</p>
          <p data-testid="totp-secret" className="select-all break-all rounded bg-slate-100 px-3 py-2 font-mono text-sm tracking-wider text-slate-900">{setup.secret}</p>
          <p className="text-xs text-slate-600">2. Enter the 6-digit code the app now shows, and your password, to turn it on.</p>
          <label className="block text-xs font-medium text-slate-600">6-digit code
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
          </label>
          <label className="block text-xs font-medium text-slate-600">Current password
            <input type="password" autoComplete="current-password" value={passwordForConfirm} onChange={(e) => setPasswordForConfirm(e.target.value)} className={input} />
          </label>
          <div className="flex gap-3">
            <button disabled={busy || code.length < 6 || !passwordForConfirm} onClick={enable} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Turn on</button>
            <button onClick={() => { setSetup(null); setCode('') }} className="text-sm text-slate-500">Cancel</button>
          </div>
        </div>
      )}

      {status?.enabled && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">Recovery codes left: <strong>{status.recoveryCodesLeft}</strong></p>
          <label className="block text-xs font-medium text-slate-600">Current password (to change anything here)
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          <div className="flex gap-3">
            <button disabled={busy || !password} onClick={regen} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">New recovery codes</button>
            <button disabled={busy || !password} onClick={turnOff} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Turn off</button>
          </div>
        </div>
      )}
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
    </section>
  )
}
