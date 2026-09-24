import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'Services',
  description:
    'Chat operations, conversation engagement, moderation, customer support, and multilingual, 24/7 managed operator teams from GCO.',
  path: '/services',
})

const SERVICES = [
  {
    title: 'Chat Operations',
    body: 'Real-time, human-handled conversation management across the channels your business already uses.',
  },
  {
    title: 'Conversation Engagement',
    body: 'Operators keep conversations active, timely, and consistent with your tone and goals.',
  },
  {
    title: 'Content & Chat Moderation',
    body: 'Consistent moderation against clearly defined standards, with supervision on top.',
  },
  {
    title: 'Customer Support Operations',
    body: 'Trained operators handling day-to-day support conversations at the volume you need.',
  },
  {
    title: 'Multilingual Operator Teams',
    body: 'Teams staffed for the languages your users actually speak, not just your headquarters.',
  },
  {
    title: '24/7 Coverage',
    body: 'Shift-based staffing so conversations get a response regardless of time zone.',
  },
  {
    title: 'Quality Assurance & Supervision',
    body: 'Ongoing review of conversations against your standards, with feedback built into the operation.',
  },
  {
    title: 'Managed BPO Teams',
    body: 'A fully managed human operations layer - staffing, training, supervision, and reporting - run for you.',
  },
]

export default function ServicesPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Services</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              A managed operations layer for your conversations
            </h1>
            <p className="mt-4 max-w-2xl text-slate-600">
              GCO staffs, trains, and supervises the human teams behind your conversations, so your product and
              support experience stays consistent as you grow.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
                <h2 className="text-base font-semibold text-slate-900">{s.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border border-slate-200 bg-slate-950 p-8 text-white sm:p-10">
            <h2 className="text-xl font-semibold">Not sure which service fits your operation?</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Tell us about your conversations and coverage needs and we&apos;ll help you figure out the right setup.
            </p>
            <Link href="/contact" className="mt-6 inline-block rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
              Talk to Us
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
