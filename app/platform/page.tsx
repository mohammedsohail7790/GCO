import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { CardGrid, SectionBlock, Steps, SupervisionEscalation } from '@/components/marketing/Blocks'
import { PlatformPreview } from '@/components/marketing/PlatformPreview'
import { HumanAiInfrastructure } from '@/components/marketing/HumanAiInfrastructure'
import { pageMetadata } from '@/lib/config/site'
import { PLATFORM_CAPABILITIES, PLATFORM_FLOW } from '@/lib/content/platform'

export const metadata = pageMetadata({
  title: 'Platform',
  description: 'The GCO operations platform: live queues, assignment, response timers, supervisor visibility, escalation, reporting and AI-assisted workflows, with a human operator in charge of every reply.',
  path: '/platform',
})

export const revalidate = 600

export default function PlatformPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <PageHero
          eyebrow="Platform"
          title="A real operations platform behind the workforce."
          lead="Human judgment, AI assistance and operational infrastructure. The platform queues, assigns, times and records the work; trained operators do it; supervisors oversee it. AI assists the operator and never replaces them."
        />
        <SectionBlock eyebrow="How work flows" title="From message to resolution" description="Every conversation moves through the same supervised path.">
          <div className="max-w-2xl">
            <Steps items={PLATFORM_FLOW.map((f) => `${f.title}: ${f.body}`)} />
          </div>
        </SectionBlock>
        <HumanAiInfrastructure />
        <SectionBlock tone="surface" eyebrow="Capabilities" title="What the platform does">
          <CardGrid items={PLATFORM_CAPABILITIES} />
        </SectionBlock>
        <PlatformPreview />
        <SupervisionEscalation />
        <SectionBlock eyebrow="Explore" title="See it applied">
          <p className="max-w-2xl text-[14.5px] leading-relaxed text-graphite-secondary">
            The platform runs every GCO service, from <Link className="font-medium text-accent-600 hover:underline" href="/services/live-chat-customer-support">live chat support</Link> and{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/services/chat-moderation">chat moderation</Link> to{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/services/dedicated-outsourced-chat-teams">dedicated teams</Link>, across{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/industries">our industries</Link>.
          </p>
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
