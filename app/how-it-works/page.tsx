import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { ProcessSteps } from '@/components/marketing/ProcessSteps'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'How It Works',
  description: 'How GCO onboards clients and runs managed conversation operations, from requirements to ongoing scaling.',
  path: '/how-it-works',
})

// Five stages, each grouping the same real onboarding/operating work
// described in more granular detail elsewhere (docs/client-onboarding-checklist.md,
// docs/client-tenant-provisioning.md) - a cleaner narrative, not a different
// or invented process.
// ProcessSteps already numbers each item in its own circle badge - titles
// stay plain (no "01 " prefix) to avoid rendering the number twice.
const STEPS = [
  {
    title: 'Discover',
    body: 'We understand the operation: your business, your channels, your workflows, tone, languages, and coverage needs.',
  },
  {
    title: 'Design',
    body: 'We define the specific workflows, roles, and integrations the operation needs - staffed and structured for your operation, not a generic pool.',
  },
  {
    title: 'Connect',
    body: 'We connect the required systems and channels, and operators are trained against your specific requirements before they touch a live conversation.',
  },
  {
    title: 'Operate',
    body: 'GCO manages the conversation operation day to day, with supervisors overseeing the team on an ongoing basis, not just at launch.',
  },
  {
    title: 'Optimize',
    body: 'Conversations are reviewed against your standards, reporting gives you regular visibility, and the operation scales with your actual volume - up or down.',
  },
]

export default function HowItWorksPage() {
  const bookingUrl = getCalendarProvider().getBookingUrl()

  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">How It Works</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              A straightforward path from first conversation to a running operation.
            </h1>
          </Container>
        </section>

        <section className="bg-paper py-20">
          <Container className="max-w-4xl">
            <ProcessSteps steps={STEPS} />

            <div className="mt-16 rounded-2xl border border-paper-border bg-paper-surface p-8 sm:p-10">
              <h2 className="font-display text-lg font-semibold text-graphite">Ready to start the conversation?</h2>
              <p className="mt-2 text-[14.5px] text-graphite-secondary">Tell us about your operation and we&apos;ll walk you through next steps.</p>
              {bookingUrl ? (
                <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-6 inline-block rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-700">
                  Book a Call
                </a>
              ) : (
                <Link href="/contact" className="mt-6 inline-block rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-700">
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
