import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { Bullets, LinkCards, PilotCallout, SectionBlock, SupervisionEscalation } from '@/components/marketing/Blocks'
import { pageMetadata } from '@/lib/config/site'
import { INDUSTRIES, getIndustry } from '@/lib/content/industries'
import { SERVICES } from '@/lib/content/services'
import { articlesForIndustry } from '@/lib/content/resources'
import { JsonLd } from '@/components/seo/JsonLd'
import { TrackView } from '@/components/analytics/TrackView'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'

export const revalidate = 600
export const dynamicParams = false

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const i = getIndustry((await params).slug)
  if (!i) return {}
  return pageMetadata({ title: i.metaTitle, description: i.metaDescription, path: `/industries/${i.slug}` })
}

export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const i = getIndustry((await params).slug)
  if (!i) notFound()
  const guides = articlesForIndustry(i.slug)
  const services = SERVICES.filter((s) => i.services.includes(s.slug))

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Industries', path: '/industries' }, { name: i.name, path: `/industries/${i.slug}` }])} />
      <TrackView event="industry_view" slug={i.slug} />
      <main id="main-content">
        <PageHero eyebrow={i.name} title={i.name} lead={i.heroLead} crumbs={[{ href: '/industries', label: 'Industries' }]} />

        <SectionBlock eyebrow="Typical workload" title="What the conversations look like">
          <div className="grid gap-10 lg:grid-cols-2">
            <Bullets items={i.workload} />
            {i.note && <p className="rounded-2xl border border-accent-100 bg-accent-50 p-6 text-[14.5px] leading-relaxed text-graphite-secondary">{i.note}</p>}
          </div>
        </SectionBlock>

        <SectionBlock tone="surface" eyebrow="Operational challenges" title="Where operations get hard">
          <Bullets items={i.challenges} />
        </SectionBlock>

        <SectionBlock eyebrow="Human operators" title="Where human operators help">
          <div className="grid gap-10 lg:grid-cols-2">
            <Bullets items={i.whereHumansHelp} />
            <div className="rounded-2xl border border-paper-border bg-paper-surface p-6">
              <h3 className="font-display text-[15px] font-semibold text-graphite">Moderation &amp; support</h3>
              <div className="mt-3">
                <Bullets items={i.moderationSupport} />
              </div>
            </div>
          </div>
        </SectionBlock>

        <SupervisionEscalation />
        <section className="bg-paper py-12">
          <div className="mx-auto max-w-6xl px-6">
            <p className="max-w-3xl text-[14.5px] leading-relaxed text-graphite-secondary">{i.supervisionEscalation}</p>
          </div>
        </section>

        <SectionBlock tone="surface" eyebrow="How GCO supports it" title="How GCO supports this workflow">
          <Bullets items={i.howGcoSupports} />
        </SectionBlock>

        <PilotCallout text="We agree the channel, volume, hours and languages first, run your real workflow for seven days under supervision, and review the results together on Day 7." location={`industry-${i.slug}`} />

        <SectionBlock eyebrow="Relevant services" title="Services for this industry">
          <LinkCards items={services.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short }))} />
        </SectionBlock>
        {guides.length > 0 && (
          <SectionBlock tone="surface" eyebrow="Resources" title="Guides for this industry">
            <LinkCards items={guides.map((g) => ({ href: `/resources/${g.slug}`, title: g.title, body: g.description }))} />
          </SectionBlock>
        )}
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
