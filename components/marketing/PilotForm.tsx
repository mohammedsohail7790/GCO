'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { trackEvent } from '@/lib/analytics/events'
import { COVERAGE_OPTIONS, SERVICE_OPTIONS, VOLUME_OPTIONS, CTA, PUBLIC_EMAIL } from '@/lib/content/site'

// Submits to the existing public lead endpoint (/api/v1/public/contact) with
// intent: 'pilot' - no parallel lead system. The honeypot is preserved: it is
// sent as `website` (the API's trap field) from an input that is deliberately NOT
// named/id'd "website", so browser autofill can never trip it for a real visitor.

const inputClass =
  'w-full min-h-11 rounded-lg border border-paper-border bg-white px-3.5 py-2.5 text-base text-graphite transition-colors focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 aria-[invalid=true]:border-red-500 sm:text-sm'
const labelClass = 'block text-sm font-medium text-graphite'

type FieldKey = 'email' | 'company' | 'companyWebsite'
type Errors = Partial<Record<FieldKey, string>>

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validate(v: { email: string; company: string; companyWebsite: string }): Errors {
  const e: Errors = {}
  if (!v.email.trim()) e.email = 'Enter your work email.'
  else if (!EMAIL_RE.test(v.email.trim())) e.email = 'Enter a valid email address, like name@company.com.'
  if (!v.company.trim()) e.company = 'Enter your company name.'
  const site = v.companyWebsite.trim()
  if (site && (/\s/.test(site) || !site.includes('.'))) e.companyWebsite = 'Enter a website like company.com, or leave this blank.'
  return e
}

export function PilotForm() {
  const uid = useId()
  const id = (k: string) => `${uid}-${k}`
  const started = useRef(false) // analytics: fire pilot_form_started once, on first interaction
  const submitting = useRef(false) // blocks double-submits even within one render tick
  const summaryRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    email: '',
    company: '',
    companyWebsite: '',
    service: '',
    volume: '',
    languages: '',
    coverage: '',
    message: '',
    trap: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle')

  // Move focus to the confirmation once it has mounted (screen readers announce it).
  useEffect(() => {
    if (status === 'sent') successRef.current?.focus()
  }, [status])

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting.current) return
    setFormError(null)

    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      trackEvent('pilot_form_error', { error_type: 'validation' })
      // Move focus to the summary so keyboard/screen-reader users hear the problem.
      setTimeout(() => summaryRef.current?.focus(), 0)
      return
    }

    submitting.current = true
    setStatus('submitting')
    try {
      const res = await fetch('/api/v1/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'pilot',
          email: form.email.trim(),
          company: form.company.trim(),
          companyWebsite: form.companyWebsite.trim() || undefined,
          service: form.service || undefined,
          volume: form.volume || undefined,
          languages: form.languages.trim() || undefined,
          coverage: form.coverage || undefined,
          message: form.message.trim() || undefined,
          website: form.trap, // honeypot (see file comment)
        }),
      })
      let json: { ok?: boolean } | null = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      if (res.status === 429) throw new Error('Too many submissions from your connection. Please wait a little and try again.')
      if (!res.ok || !json?.ok) throw new Error('We could not send your request. Please check the details and try again.')
      setStatus('sent')
      trackEvent('pilot_form_submitted') // behaviour only: never any form content
    } catch (err) {
      // Only our own safe, fixed messages are ever shown - never raw server text.
      const safe =
        err instanceof Error && /^(Too many|We could not)/.test(err.message)
          ? err.message
          : 'Something went wrong sending your request. Please try again, or email us directly.'
      setFormError(safe)
      trackEvent('pilot_form_error', { error_type: safe.startsWith('Too many') ? 'rate_limited' : 'server' })
      setStatus('idle')
      setTimeout(() => summaryRef.current?.focus(), 0)
    } finally {
      submitting.current = false
    }
  }

  if (status === 'sent') {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm leading-relaxed text-emerald-900 focus:outline-none"
      >
        <p className="font-display text-base font-semibold">Thanks, we&apos;ve received your pilot request.</p>
        <p className="mt-2">
          We&apos;ll be in touch to set up a short discovery conversation about your workflow, volume and coverage
          before anything starts.
        </p>
      </div>
    )
  }

  const errorList = (Object.entries(errors) as [FieldKey, string | undefined][]).filter(([, m]) => m)

  return (
    <form
      onSubmit={handleSubmit}
      onFocusCapture={() => {
        if (!started.current) {
          started.current = true
          trackEvent('pilot_form_started')
        }
      }}
      noValidate className="relative space-y-5" aria-busy={status === 'submitting'}>
      {/* Honeypot: off-screen (not display:none, which some bots skip), hidden from assistive tech, not autofillable. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor={id('trap')}>Leave this field empty</label>
        <input
          id={id('trap')}
          name="contact_extra"
          tabIndex={-1}
          autoComplete="off"
          value={form.trap}
          onChange={(e) => update('trap', e.target.value)}
        />
      </div>

      <div ref={summaryRef} tabIndex={-1} role="alert" className="focus:outline-none">
        {(errorList.length > 0 || formError) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {formError ? (
              <p>
                {formError}{' '}
                <a className="font-medium underline" href={`mailto:${PUBLIC_EMAIL}`}>
                  {PUBLIC_EMAIL}
                </a>
              </p>
            ) : (
              <>
                <p className="font-medium">Please fix the following:</p>
                <ul className="mt-1 list-disc pl-5">
                  {errorList.map(([k, m]) => (
                    <li key={k}>
                      <a className="underline" href={`#${id(k)}`}>
                        {m}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={id('email')}>
            Work email <span aria-hidden="true">*</span>
          </label>
          <input
            id={id('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            aria-required="true"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? id('email-err') : undefined}
            maxLength={200}
            className={`mt-1.5 ${inputClass}`}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
          {errors.email && (
            <p id={id('email-err')} className="mt-1.5 text-[13px] text-red-700">
              {errors.email}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor={id('company')}>
            Company <span aria-hidden="true">*</span>
          </label>
          <input
            id={id('company')}
            autoComplete="organization"
            required
            aria-required="true"
            aria-invalid={errors.company ? true : undefined}
            aria-describedby={errors.company ? id('company-err') : undefined}
            maxLength={200}
            className={`mt-1.5 ${inputClass}`}
            value={form.company}
            onChange={(e) => update('company', e.target.value)}
          />
          {errors.company && (
            <p id={id('company-err')} className="mt-1.5 text-[13px] text-red-700">
              {errors.company}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={id('companyWebsite')}>
            Website
          </label>
          <input
            id={id('companyWebsite')}
            inputMode="url"
            autoComplete="url"
            placeholder="company.com"
            aria-invalid={errors.companyWebsite ? true : undefined}
            aria-describedby={errors.companyWebsite ? id('companyWebsite-err') : undefined}
            maxLength={300}
            className={`mt-1.5 ${inputClass}`}
            value={form.companyWebsite}
            onChange={(e) => update('companyWebsite', e.target.value)}
          />
          {errors.companyWebsite && (
            <p id={id('companyWebsite-err')} className="mt-1.5 text-[13px] text-red-700">
              {errors.companyWebsite}
            </p>
          )}
        </div>
        <div>
          <label className={labelClass} htmlFor={id('service')}>
            Service needed
          </label>
          <select id={id('service')} className={`mt-1.5 ${inputClass}`} value={form.service} onChange={(e) => update('service', e.target.value)}>
            <option value="">Select…</option>
            {SERVICE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={id('volume')}>
            Approx. monthly messages / conversations
          </label>
          <select id={id('volume')} className={`mt-1.5 ${inputClass}`} value={form.volume} onChange={(e) => update('volume', e.target.value)}>
            <option value="">Select…</option>
            {VOLUME_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor={id('coverage')}>
            Coverage needed
          </label>
          <select id={id('coverage')} className={`mt-1.5 ${inputClass}`} value={form.coverage} onChange={(e) => update('coverage', e.target.value)}>
            <option value="">Select…</option>
            {COVERAGE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor={id('languages')}>
          Languages
        </label>
        <input
          id={id('languages')}
          placeholder="e.g. English, Spanish"
          maxLength={200}
          className={`mt-1.5 ${inputClass}`}
          value={form.languages}
          onChange={(e) => update('languages', e.target.value)}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor={id('message')}>
          Message
        </label>
        <textarea
          id={id('message')}
          rows={4}
          maxLength={4000}
          className={`mt-1.5 ${inputClass}`}
          placeholder="Anything we should know about your workflow?"
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
        />
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === 'submitting' ? 'Sending…' : CTA.pilot}
      </button>
      <p className="text-xs leading-relaxed text-graphite-muted">
        We&apos;ll use these details to follow up on your request.
      </p>
    </form>
  )
}
