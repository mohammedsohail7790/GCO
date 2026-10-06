import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { LinkCards, SectionBlock } from '@/components/marketing/Blocks'
import { JsonLd } from '@/components/seo/JsonLd'
import { pageMetadata } from '@/lib/config/site'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { RESOURCE_CATEGORIES, formatDate, publishedArticles, readingMinutes } from '@/lib/content/resources'
import { SERVICES } from '@/lib/content/services'

export const metadata = pageMetadata({
  title: 'Resources',
  description: 'Practical guides on chat operations, moderation, 24/7 coverage, human + AI operations and outsourcing, from the team running conversation operations at GCO.',
  path: '/resources',
})

export const revalidate = 600

export default function ResourcesPage() {
  const articles = publishedArticles()
  const featured = articles.find((a) => a.featured) ?? articles[0]
  const rest = articles.filter((a) => a.slug !== featured?.slug)

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }])} />
      <main id="main-content">
        <PageHero
          eyebrow="Resources"
          title="Practical guides on running conversation operations."
          lead="Chat operations, moderation, coverage, human + AI workflows and outsourcing, written for teams who run or buy conversation operations."
          ctas={false}
        />

        {featured && (
          <section className="bg-paper py-14 sm:py-16">
            <Container>
              <Eyebrow>Featured</Eyebrow>
              <Link href={`/resources/${featured.slug}`} className="group mt-4 block rounded-2xl border border-paper-border bg-paper-surface p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel sm:p-10">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-600">{featured.category}</p>
                <h2 className="font-display mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-graphite sm:text-3xl">{featured.title}</h2>
                <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-graphite-secondary">{featured.description}</p>
                <p className="mt-5 text-[13px] text-graphite-muted">
                  {formatDate(featured.publishedAt)} · {readingMinutes(featured)} min read
                </p>
                <span className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-accent-600 transition-colors group-hover:text-accent-700">
                  Read the guide <span aria-hidden="true" className="ml-2">→</span>
                </span>
              </Link>
            </Container>
          </section>
        )}

        <section className="border-t border-paper-border bg-paper-surface py-14 sm:py-16">
          <Container>
            <h2 className="font-display text-xl font-semibold text-graphite">More guides</h2>
            <ul className="mt-6 divide-y divide-paper-border rounded-2xl border border-paper-border bg-paper">
              {rest.map((a) => (
                <li key={a.slug}>
                  <Link href={`/resources/${a.slug}`} className="group flex flex-col gap-1 p-6 transition-colors hover:bg-paper-surface sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                    <span>
                      <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-600">{a.category}</span>
                      <span className="font-display mt-1 block text-[17px] font-semibold text-graphite group-hover:text-accent-700">{a.title}</span>
                      <span className="mt-1 block max-w-2xl text-[14px] leading-relaxed text-graphite-secondary">{a.description}</span>
                    </span>
                    <span className="mt-2 shrink-0 text-[13px] text-graphite-muted sm:mt-0">{readingMinutes(a)} min read</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-[13.5px] text-graphite-muted">
              Topics: {RESOURCE_CATEGORIES.join(' · ')}
            </p>
          </Container>
        </section>

        <SectionBlock eyebrow="Services" title="The services these guides apply to">
          <LinkCards items={SERVICES.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short }))} />
        </SectionBlock>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
