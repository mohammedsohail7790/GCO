import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { Bullets, CardGrid, FaqList, LinkCards, PilotCallout, SectionBlock, Steps, SupervisionEscalation } from '@/components/marketing/Blocks'
import { Container } from '@/components/marketing/Container'
import { pageMetadata } from '@/lib/config/site'
import { SERVICES, getService } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'
import { LANGUAGES_TEXT, STAFFING_NOTE } from '@/lib/content/site'

export const revalidate = 600
export const dynamicParams = false

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = getService((await params).slug)
  if (!s) return {}
  return pageMetadata({ title: s.metaTitle, description: s.metaDescription, path: `/services/${s.slug}` })
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const s = getService((await params).slug)
  if (!s) notFound()
  const industries = INDUSTRIES.filter((i) => s.industries.includes(i.slug))
  const related = SERVICES.filter((x) => s.related.includes(x.slug))
  const showStaffing = s.slug === 'multilingual-chat-operations' || s.slug === '24-7-chat-coverage'

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <PageHero eyebrow={s.name} title={s.name} lead={s.heroLead} crumbs={[{ href: '/services', label: 'Services' }]} />

        <SectionBlock eyebrow="The business need" title={s.problem.title} description={s.problem.body}>
          <div className="grid gap-10 lg:grid-cols-2">
            <Bullets items={s.problem.points} />
            {showStaffing && (
              <div className="rounded-2xl border border-accent-100 bg-accent-50 p-6 text-[14.5px] leading-relaxed text-graphite-secondary">
                {s.slug === 'multilingual-chat-operations' && <p className="mb-2 font-medium text-graphite">Languages: {LANGUAGES_TEXT}.</p>}
                <p>{STAFFING_NOTE}</p>
              </div>
            )}
          </div>
        </SectionBlock>

        <SectionBlock tone="surface" eyebrow="What GCO manages" title="What we run for you">
          <Bullets items={s.manages} />
        </SectionBlock>

        <SectionBlock eyebrow="Delivery model" title="How GCO delivers it">
          <CardGrid items={s.delivery} />
        </SectionBlock>

        <SectionBlock tone="surface" eyebrow="Operational workflow" title="How a conversation moves">
          <div className="max-w-2xl">
            <Steps items={s.workflow} />
          </div>
        </SectionBlock>

        <SectionBlock eyebrow="Capabilities" title="Capabilities">
          <div className="grid gap-10 lg:grid-cols-2">
            <Bullets items={s.capabilities} />
            <div className="rounded-2xl border border-paper-border bg-paper-surface p-6">
              <h3 className="font-display text-[15px] font-semibold text-graphite">Ideal for</h3>
              <div className="mt-3">
                <Bullets items={s.idealFor} />
              </div>
            </div>
          </div>
        </SectionBlock>

        <SupervisionEscalation />
        <PilotCallout text={s.pilot} location={`service-${s.slug}`} />

        <SectionBlock eyebrow="Industries" title="Relevant industries">
          <LinkCards items={industries.map((i) => ({ href: `/industries/${i.slug}`, title: i.name, body: i.short }))} />
        </SectionBlock>

        <SectionBlock tone="surface" eyebrow="FAQ" title="Questions about this service">
          <div className="max-w-3xl">
            <FaqList faqs={s.faqs} />
          </div>
        </SectionBlock>

        <section className="bg-paper py-14">
          <Container>
            <h2 className="font-display text-lg font-semibold text-graphite">Related services</h2>
            <div className="mt-6">
              <LinkCards items={related.map((x) => ({ href: `/services/${x.slug}`, title: x.name, body: x.short }))} />
            </div>
          </Container>
        </section>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
