import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { ProcessSteps } from '@/components/marketing/ProcessSteps'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'How It Works',
  description: 'How GCO onboards clients and runs managed conversation operations, from requirements to ongoing scaling.',
  path: '/how-it-works',
})

const STEPS = [
  { title: 'Client onboarding', body: 'We start with a conversation about your business, your channels, and what "good" looks like for your conversations.' },
  { title: 'Requirements definition', body: 'We define the specific workflows, tone, tools, languages, and coverage hours your operation needs.' },
  { title: 'Operator / team setup', body: 'We staff the right team size and skill set for your operation, not a generic pool.' },
  { title: 'Training', body: 'Operators are trained against your specific requirements before they touch a live conversation.' },
  { title: 'Supervision', body: 'Supervisors oversee the team on an ongoing basis, not just at launch.' },
  { title: 'Quality control', body: 'Conversations are reviewed against your standards, with feedback fed back into the team.' },
  { title: 'Ongoing reporting', body: 'You get visibility into how the operation is performing, on a regular cadence.' },
  { title: 'Scaling', body: 'As your volume or requirements change, the team scales with you - up or down.' },
]

export default function HowItWorksPage() {
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
              <Link href="/contact" className="mt-6 inline-block rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-paper transition-colors hover:bg-ink-700">
                Contact Us
              </Link>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
