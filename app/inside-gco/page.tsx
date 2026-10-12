import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { SectionBlock, Steps } from '@/components/marketing/Blocks'
import { InsideGcoSections, InsideGcoVideo } from '@/components/marketing/InsideGco'
import { pageMetadata } from '@/lib/config/site'
import { INSIDE_DEMO_NOTE, INSIDE_WORKFLOW } from '@/lib/content/insideGco'

export const metadata = pageMetadata({
  title: 'Inside GCO: Our Technology in Action',
  description: 'See the real GCO platform: the operator dashboard, live queue and assignment, supervisor dashboard, quality control and language-matched routing, shown with demo data.',
  path: '/inside-gco',
})

export const revalidate = 600

export default function InsideGcoPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <PageHero
          eyebrow="Inside GCO"
          title="Our technology in action."
          lead="GCO is not just a team of operators. Every conversation runs through our own operations platform: queued, assigned, answered by a person, supervised and recorded. These are the real screens."
        />
        <section className="border-b border-paper-border bg-paper-surface py-4">
          <div className="mx-auto max-w-6xl px-5 text-[13px] text-graphite-secondary sm:px-8">{INSIDE_DEMO_NOTE}</div>
        </section>
        <InsideGcoVideo />
        <InsideGcoSections />
        <SectionBlock tone="surface" eyebrow="6 · The complete workflow" title="From a customer’s message to a recorded resolution" description="The same supervised path for every conversation.">
          <div className="max-w-2xl">
            <Steps items={INSIDE_WORKFLOW.map((f) => `${f.title}: ${f.body}`)} />
          </div>
        </SectionBlock>
        <SectionBlock eyebrow="Learn more" title="Want the full walkthrough?">
          <p className="max-w-2xl text-[14.5px] leading-relaxed text-graphite-secondary">
            We walk prospective clients and partners through a longer demonstration on request. See how it fits your operation on the{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/platform">platform page</Link>, read the{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/security">security overview</Link>, or{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/contact">contact us to request a demonstration</Link>.
          </p>
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
