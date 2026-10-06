import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { ArticleBody } from '@/components/marketing/ArticleBody'
import { BookCallLink, PilotCtaLink } from '@/components/marketing/CtaLinks'
import { LinkCards } from '@/components/marketing/Blocks'
import { JsonLd } from '@/components/seo/JsonLd'
import { TrackView } from '@/components/analytics/TrackView'
import { pageMetadata } from '@/lib/config/site'
import { articleJsonLd, breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { formatDate, getArticle, publishedArticles, readingMinutes, relatedArticles } from '@/lib/content/resources'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'
import { PILOT_PROMISES } from '@/lib/content/site'

export const revalidate = 600
export const dynamicParams = false

export function generateStaticParams() {
  return publishedArticles().map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug)
  if (!a) return {}
  return pageMetadata({ title: a.title, description: a.description, path: `/resources/${a.slug}`, type: 'article', article: { publishedTime: a.publishedAt } })
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug)
  if (!a) notFound()
  const path = `/resources/${a.slug}`
  const services = SERVICES.filter((s) => a.services.includes(s.slug))
  const industries = INDUSTRIES.filter((i) => a.industries.includes(i.slug))
  const more = relatedArticles(a)

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <JsonLd
        data={[
          articleJsonLd({ title: a.title, description: a.description, path, publishedAt: a.publishedAt, section: a.category }),
          breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }, { name: a.title, path }]),
        ]}
      />
      <TrackView event="resource_view" slug={a.slug} category={a.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')} />
      <main id="main-content">
        <header className="border-b border-paper-border bg-ink text-white">
          <Container className="py-12 sm:py-16">
            <nav aria-label="Breadcrumb" className="text-[13px] text-white/50">
              <Link href="/resources" className="inline-block py-3 transition-colors hover:text-white">Resources</Link>
              <span aria-hidden="true" className="mx-2">/</span>
              <span className="text-white/80">{a.category}</span>
            </nav>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-100">{a.category}</p>
            <h1 className="font-display mt-4 max-w-3xl text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">{a.title}</h1>
            <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-white/65">{a.description}</p>
            <p className="mt-6 text-[13px] text-white/45">
              <time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time> · {readingMinutes(a)} min read · By the GCO team
            </p>
          </Container>
        </header>

        <article className="bg-paper py-14 sm:py-20">
          <Container>
            <ArticleBody blocks={a.body} />

            <section aria-labelledby="article-cta" className="mt-14 max-w-[68ch] rounded-2xl bg-ink p-7 text-white sm:p-9">
              <h2 id="article-cta" className="font-display text-xl font-semibold">Test it on your own conversations</h2>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-white/60">
                {PILOT_PROMISES.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-accent-400" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <PilotCtaLink kind="resource" label={a.cta.primary} location={`resource-${a.slug}`} />
                {a.cta.secondary === 'contact' && <BookCallLink kind="resource" label="Talk to GCO" location={`resource-${a.slug}-talk`} />}
              </div>
            </section>
          </Container>
        </article>

        <section className="border-t border-paper-border bg-paper-surface py-14">
          <Container>
            <h2 className="font-display text-lg font-semibold text-graphite">Related services and industries</h2>
            <div className="mt-6">
              <LinkCards
                items={[
                  ...services.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short })),
                  ...industries.map((i) => ({ href: `/industries/${i.slug}`, title: i.name, body: i.short })),
                  { href: '/platform', title: 'The GCO platform', body: 'Queues, assignment, supervision and escalation behind the operators.' },
                ]}
              />
            </div>
          </Container>
        </section>

        {more.length > 0 && (
          <section className="bg-paper py-14">
            <Container>
              <h2 className="font-display text-lg font-semibold text-graphite">More resources</h2>
              <div className="mt-6">
                <LinkCards items={more.map((m) => ({ href: `/resources/${m.slug}`, title: m.title, body: m.description }))} />
              </div>
            </Container>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
