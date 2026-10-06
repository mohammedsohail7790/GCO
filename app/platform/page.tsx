import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { CardGrid, SectionBlock, Steps, SupervisionEscalation } from '@/components/marketing/Blocks'
import { PlatformShowcase } from '@/components/marketing/PlatformPreview'
import { HumanAiInfrastructure } from '@/components/marketing/HumanAiInfrastructure'
import { pageMetadata } from '@/lib/config/site'
import { TrackView } from '@/components/analytics/TrackView'
import { PLATFORM_CAPABILITIES, PLATFORM_FLOW } from '@/lib/content/platform'
import { Bullets } from '@/components/marketing/Blocks'

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
      <TrackView event="platform_view" />
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
        <PlatformShowcase />
        <SectionBlock eyebrow="AI-assisted human workflow" title="AI assists the operator. The operator replies." description="GCO combines human operators with operational infrastructure and AI-assisted workflows. AI is a drafting aid inside the operator's workspace.">
          <div className="max-w-2xl">
            <Steps items={['AI can draft a suggested reply for the conversation', 'The human operator reviews and edits the draft', 'The operator decides, and sends the reply', 'Nothing is sent automatically by AI']} />
          </div>
        </SectionBlock>
        <SectionBlock tone="surface" eyebrow="Capabilities" title="What the platform does">
          <CardGrid items={PLATFORM_CAPABILITIES} />
        </SectionBlock>
        <SectionBlock eyebrow="Client visibility" title="Clients see what is relevant to their operation" description="Client users see the information and decisions relevant to their own operation. Internal operator and supervisor notes are never shown to clients, and each client only ever sees its own data.">
          <Bullets items={['Escalations awaiting a client decision, with a client-facing summary', 'Client-visible messages from GCO management', 'Operational usage and support requests for their own operation']} />
        </SectionBlock>
        <SupervisionEscalation />
        <SectionBlock eyebrow="Explore" title="See it applied">
          <p className="max-w-2xl text-[14.5px] leading-relaxed text-graphite-secondary">
            The platform runs every GCO service, from <Link className="font-medium text-accent-600 hover:underline" href="/services/live-chat-customer-support">live chat support</Link> and{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/services/chat-moderation">chat moderation</Link> to{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/services/dedicated-outsourced-chat-teams">dedicated teams</Link>, across{' '}
            <Link className="font-medium text-accent-600 hover:underline" href="/industries">our industries</Link>. Read the <Link className="font-medium text-accent-600 hover:underline" href="/security">security overview</Link> or the guide to the <Link className="font-medium text-accent-600 hover:underline" href="/resources/how-a-human-ai-conversation-operations-model-works">human + AI operating model</Link>.
          </p>
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
