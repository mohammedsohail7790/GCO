import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { LinkCards, SectionBlock, SupervisionEscalation } from '@/components/marketing/Blocks'
import { pageMetadata } from '@/lib/config/site'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'

export const metadata = pageMetadata({
  title: 'Services',
  description: 'Six chat-operations services from GCO: live chat support, chat moderation, community moderation, multilingual operations, 24/7 coverage and dedicated teams. Free 7-day pilot.',
  path: '/services',
})

export const revalidate = 600

export default function ServicesPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <PageHero
          eyebrow="Services"
          title="Operations behind every conversation."
          lead="GCO staffs, trains and supervises the human teams behind your chat, supported by an operations platform and AI-assisted workflows. Six focused services, each delivered the same supervised way."
        />
        <SectionBlock eyebrow="What we run" title="Six services, one operating model" description="Every service runs on the same platform with the same supervision, QA and escalation path.">
          <LinkCards items={SERVICES.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short }))} />
        </SectionBlock>
        <SupervisionEscalation />
        <SectionBlock tone="surface" eyebrow="Industries" title="Where this applies" description="Dating & Social is our strongest initial specialisation; the model serves any chat-first business.">
          <LinkCards items={INDUSTRIES.map((i) => ({ href: `/industries/${i.slug}`, title: i.name, body: i.short }))} />
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
