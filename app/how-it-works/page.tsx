import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'How It Works',
  description: 'How GCO onboards clients and runs managed conversation operations, from requirements to ongoing scaling.',
  path: '/how-it-works',
})

const STEPS = [
  {
    title: 'Client onboarding',
    body: 'We start with a conversation about your business, your channels, and what "good" looks like for your conversations.',
  },
  {
    title: 'Requirements definition',
    body: 'We define the specific workflows, tone, tools, languages, and coverage hours your operation needs.',
  },
  {
    title: 'Operator / team setup',
    body: 'We staff the right team size and skill set for your operation, not a generic pool.',
  },
  {
    title: 'Training',
    body: 'Operators are trained against your specific requirements before they touch a live conversation.',
  },
  {
    title: 'Supervision',
    body: 'Supervisors oversee the team on an ongoing basis, not just at launch.',
  },
  {
    title: 'Quality control',
    body: 'Conversations are reviewed against your standards, with feedback fed back into the team.',
  },
  {
    title: 'Ongoing reporting',
    body: 'You get visibility into how the operation is performing, on a regular cadence.',
  },
  {
    title: 'Scaling',
    body: 'As your volume or requirements change, the team scales with you - up or down.',
  },
]

export default function HowItWorksPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">How It Works</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              A straightforward path from first conversation to a running operation
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <ol className="space-y-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-5">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
                  {i + 1}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-14 rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
            <h2 className="text-lg font-semibold text-slate-900">Ready to start the conversation?</h2>
            <p className="mt-2 text-sm text-slate-600">Tell us about your operation and we&apos;ll walk you through next steps.</p>
            <Link href="/contact" className="mt-5 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
              Contact Us
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
