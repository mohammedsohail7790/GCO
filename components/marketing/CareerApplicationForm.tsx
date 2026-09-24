'use client'

import { useState } from 'react'

const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelClass = 'block text-sm font-medium text-slate-700'

export function CareerApplicationForm() {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    country: '',
    languages: '',
    message: '',
    website: '', // honeypot
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/v1/public/careers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? 'Something went wrong. Please try again.')
      setStatus('sent')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
        Thanks for applying - we&apos;ve received your application and will review it.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="cf-website">Website</label>
        <input id="cf-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => update('website', e.target.value)} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="fullName">Full name *</label>
          <input id="fullName" required maxLength={200} className={inputClass} value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">Email *</label>
          <input id="email" type="email" required maxLength={200} className={inputClass} value={form.email} onChange={(e) => update('email', e.target.value)} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="phone">Phone</label>
          <input id="phone" maxLength={50} className={inputClass} value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>
        <div>
          <label className={labelClass} htmlFor="country">Country</label>
          <input id="country" maxLength={100} className={inputClass} value={form.country} onChange={(e) => update('country', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="languages">Languages spoken</label>
        <input id="languages" maxLength={300} placeholder="e.g. English, Spanish" className={inputClass} value={form.languages} onChange={(e) => update('languages', e.target.value)} />
      </div>

      <div>
        <label className={labelClass} htmlFor="message">Tell us about yourself</label>
        <textarea id="message" rows={4} maxLength={4000} className={inputClass} value={form.message} onChange={(e) => update('message', e.target.value)} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit Application'}
      </button>
    </form>
  )
}
