import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { CareerApplicationForm } from '@/components/marketing/CareerApplicationForm'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'Careers',
  description: 'Join GCO as an operator - reliable, skilled people handling chat operations, engagement, and moderation.',
  path: '/careers',
})

const WHAT_WE_LOOK_FOR = [
  'Clear, reliable communication',
  'Consistency and reliability with schedules',
  'Strong language skills in your working language(s)',
  'Ability to follow defined workflows and guidelines',
  'Attention to quality and detail',
  'Comfort working in a supervised, feedback-driven environment',
]

export default function CareersPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-slate-100 bg-slate-950 text-white">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-200">Join Our Team</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              We&apos;re always looking for reliable operators
            </h1>
            <p className="mt-4 max-w-2xl text-slate-300">
              GCO operators handle real conversations for real businesses. We look for people who communicate well,
              show up consistently, and take quality seriously.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">What we look for</h2>
              <ul className="mt-5 space-y-3">
                {WHAT_WE_LOOK_FOR.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-slate-600">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="text-sm font-semibold text-slate-900">Training and onboarding</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Every operator is trained against the specific workflows and standards of the operation they join
                  before handling live conversations, with ongoing supervision and feedback after that.
                </p>
              </div>

              <p className="mt-6 text-xs text-slate-500">
                Roles, hours, and compensation vary by operation and are confirmed individually during the
                application process - nothing on this page is a specific offer of employment or pay.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
              <h2 className="text-lg font-semibold text-slate-900">Apply</h2>
              <p className="mt-2 text-sm text-slate-600">Tell us a bit about yourself and we&apos;ll be in touch.</p>
              <div className="relative mt-6">
                <CareerApplicationForm />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
