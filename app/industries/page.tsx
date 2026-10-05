import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { LinkCards, SectionBlock, SupervisionEscalation } from '@/components/marketing/Blocks'
import { pageMetadata } from '@/lib/config/site'
import { INDUSTRIES } from '@/lib/content/industries'
import { SERVICES } from '@/lib/content/services'

export const metadata = pageMetadata({
  title: 'Industries',
  description: 'Chat operations for dating & social platforms, online communities, SaaS, e-commerce and apps & digital platforms. Supervised human operators and a free 7-day pilot.',
  path: '/industries',
})

export const revalidate = 600

export default function IndustriesPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <PageHero
          eyebrow="Industries"
          title="Chat operations for businesses that live in conversation."
          lead="GCO is a chat-operations company. Dating & Social is our strongest initial specialisation, and the same supervised operating model serves communities, SaaS, e-commerce and digital platforms."
        />
        <SectionBlock eyebrow="Industries" title="Where GCO operates">
          <LinkCards items={INDUSTRIES.map((i) => ({ href: `/industries/${i.slug}`, title: i.name, body: i.short }))} />
        </SectionBlock>
        <SupervisionEscalation />
        <SectionBlock tone="surface" eyebrow="Services" title="The services behind every industry">
          <LinkCards items={SERVICES.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short }))} />
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
