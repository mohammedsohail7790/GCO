import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tryGetSession } from '@/lib/auth/session'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'
import { pageMetadata } from '@/lib/config/site'

const ROLE_HOME: Record<string, string> = {
  CEO_ADMIN: '/admin',
  MANAGER: '/manager',
  ASSISTANT: '/manager',
  OPERATOR: '/operator',
  CLIENT: '/client-panel',
  HUNTER: '/hunter',
}

export const metadata = pageMetadata({
  title: 'Managed Conversation Operations',
  description:
    'GCO provides trained, supervised human operator teams for chat operations, conversation engagement, and moderation - 24/7, multilingual, and built to scale with your business.',
  path: '/',
})

export default async function Home() {
  const session = await tryGetSession()
  if (session) redirect(ROLE_HOME[session.role] ?? '/login')

  const bookingUrl = getCalendarProvider().getBookingUrl()

  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse at top left, rgba(53,99,233,0.55), transparent 55%), radial-gradient(ellipse at bottom right, rgba(53,99,233,0.35), transparent 50%)',
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-28">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-200">Managed conversation operations</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Human operator teams for chat, engagement, and moderation - trained, supervised, and always on.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-300">
              GCO builds and manages the human operations layer behind your conversations: real operators, real
              supervision, and quality control, backed by a platform built for coverage and scale.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              {bookingUrl ? (
                <a href={bookingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600">
                  Book a Call
                </a>
              ) : (
                <Link href="/contact" className="rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-600">
                  Book a Call
                </Link>
              )}
              <Link href="/services" className="rounded-lg border border-white/20 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10">
                Explore Services
              </Link>
            </div>
          </div>
        </section>

        {/* Capability strip */}
        <section className="border-b border-slate-100 bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-3 lg:grid-cols-6">
            {[
              '24/7 coverage',
              'Multilingual operators',
              'Trained teams',
              'Supervision & QA',
              'Scalable staffing',
              'Managed operations',
            ].map((item) => (
              <div key={item} className="text-center text-sm font-medium text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </section>

        {/* How it works, brief */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How GCO works</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            We take the time to understand what your conversations actually need, then build and run the human
            operations behind them - so you get reliable coverage without hiring, training, and managing an in-house
            team yourself.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              { step: '1', title: 'Onboarding & requirements', body: 'We learn your workflows, tone, tools, and coverage needs.' },
              { step: '2', title: 'Team setup & training', body: 'Operators are staffed, trained, and equipped for your specific operation.' },
              { step: '3', title: 'Supervision & reporting', body: 'Ongoing quality control, supervision, and reporting as you scale.' },
            ].map((s) => (
              <div key={s.step} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-600">
                  {s.step}
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>
          <Link href="/how-it-works" className="mt-8 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
            See the full process →
          </Link>
        </section>

        {/* Services overview */}
        <section className="border-t border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">What we run for you</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { title: 'Chat Operations', body: 'Real-time conversation handling across your channels.' },
                { title: 'Conversation Engagement', body: 'Keeping conversations active, responsive, and on-brand.' },
                { title: 'Content & Chat Moderation', body: 'Consistent moderation aligned to your standards.' },
                { title: 'Customer Support Operations', body: 'Trained operators handling day-to-day support volume.' },
              ].map((s) => (
                <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
                  <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                </div>
              ))}
            </div>
            <Link href="/services" className="mt-8 inline-block text-sm font-semibold text-brand-600 hover:text-brand-700">
              View all services →
            </Link>
          </div>
        </section>

        {/* Trust / quality */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Built on supervision and quality control</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Every operator team is supervised, every conversation is subject to quality review, and every operation
            is set up to scale up or down as your needs change - not a one-size-fits-all outsourcing arrangement.
          </p>
        </section>

        {/* Dual CTA */}
        <section className="border-t border-slate-100 bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-16 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-950 p-8 text-white">
              <h3 className="text-xl font-semibold">Looking for BPO support?</h3>
              <p className="mt-2 text-sm text-slate-300">Tell us about your operation and we&apos;ll get back to you.</p>
              {bookingUrl ? (
                <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                  Book a Call
                </a>
              ) : (
                <Link href="/contact" className="mt-6 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                  Contact Us
                </Link>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 p-8">
              <h3 className="text-xl font-semibold text-slate-900">Want to join GCO?</h3>
              <p className="mt-2 text-sm text-slate-600">We&apos;re always looking for reliable, skilled operators.</p>
              <Link href="/careers" className="mt-6 inline-block rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50">
                View Opportunities
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
