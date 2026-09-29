import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { ServiceCard } from '@/components/marketing/ServiceCard'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'Services',
  description:
    'Chat operations, conversation engagement, moderation, customer support, and multilingual, 24/7 managed operator teams from GCO.',
  path: '/services',
})

// `status` is only set when the capability is genuinely integration-ready
// rather than already running - never marked "implemented" for something
// that requires a client-specific connector that hasn't been built yet.
const SERVICES = [
  { title: 'Chat Operations', body: 'GCO operates real-time conversation handling across your channels - so volume growth never means slower or less consistent responses.' },
  { title: 'Conversation Engagement', body: 'GCO keeps conversations active, timely, and on-brand - because an unanswered conversation is a lost one, at any scale.' },
  { title: 'Content & Chat Moderation', body: 'GCO enforces your standards consistently, conversation after conversation - so quality doesn’t depend on which operator is on shift.' },
  { title: 'Customer Support Operations', body: 'GCO handles day-to-day support volume with trained operators - freeing your team to work on what actually needs their attention.' },
  { title: 'Multilingual Operator Teams', body: 'Teams staffed for the languages your users actually speak, not just your headquarters.' },
  { title: '24/7 Coverage', body: 'Shift-based staffing so conversations get a response regardless of time zone.' },
  { title: 'Quality Assurance & Supervision', body: 'Ongoing review of conversations against your standards, with feedback built into the operation.' },
  { title: 'Managed BPO Teams', body: 'A fully managed human operations layer - staffing, training, supervision, and reporting - run for you.' },
  {
    title: 'Workflow & Integration',
    body: 'Connect the channels and client systems your operation needs - built on a proven ingestion pipeline, configured per client.',
    status: 'integration-ready' as const,
  },
]

export default function ServicesPage() {
  const bookingUrl = getCalendarProvider().getBookingUrl()

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">Services</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Operations behind every conversation.
            </h1>
            <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
              GCO staffs, trains, and supervises the human teams behind your conversations, so your product and
              support experience stays consistent as you grow.
            </p>
          </Container>
        </section>

        <section className="bg-paper py-20">
          <Container>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map((s, i) => (
                <ServiceCard key={s.title} index={i} title={s.title} body={s.body} status={s.status} />
              ))}
            </div>

            <div className="mt-16 overflow-hidden rounded-2xl bg-ink p-9 text-white sm:p-12">
              <h2 className="font-display text-xl font-semibold sm:text-2xl">Not sure which service fits your operation?</h2>
              <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-white/60">
                Tell us about your conversations and coverage needs and we&apos;ll help you figure out the right setup.
              </p>
              {bookingUrl ? (
                <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-7 inline-block rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
                  Book a Call
                </a>
              ) : (
                <Link href="/contact" className="mt-7 inline-block rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
                  Book a Call
                </Link>
              )}
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
