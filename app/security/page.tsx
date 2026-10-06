import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PageHero } from '@/components/marketing/PageHero'
import { Container } from '@/components/marketing/Container'
import { Bullets } from '@/components/marketing/Blocks'
import { Reveal } from '@/components/marketing/Reveal'
import { JsonLd } from '@/components/seo/JsonLd'
import { pageMetadata } from '@/lib/config/site'
import { breadcrumbJsonLd } from '@/lib/seo/jsonld'
import { SECURITY_CLOSING, SECURITY_SECTIONS } from '@/lib/content/security'

export const metadata = pageMetadata({
  title: 'Security & Operational Controls',
  description: 'The access, isolation, transport, audit, webhook, backup and monitoring controls GCO uses to run conversation operations, described plainly.',
  path: '/security',
})

export const revalidate = 600

export default function SecurityPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Security', path: '/security' }])} />
      <main id="main-content">
        <PageHero
          eyebrow="Security"
          title="Security & operational controls."
          lead="How GCO controls access, separates client data, records activity and protects the platform that conversation operations run on. This page describes controls that are in place today."
          ctas={false}
        />
        <section className="bg-paper py-14 sm:py-20">
          <Container>
            <ul className="grid gap-5 lg:grid-cols-2">
              {SECURITY_SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <Reveal delay={(i % 2) * 60} className="h-full">
                    <section id={s.id} aria-labelledby={`${s.id}-h`} className="h-full rounded-2xl border border-paper-border bg-paper-surface p-7">
                      <h2 id={`${s.id}-h`} className="font-display text-[17px] font-semibold text-graphite">{s.title}</h2>
                      <p className="mt-3 text-[14.5px] leading-relaxed text-graphite-secondary">{s.body}</p>
                      <div className="mt-4">
                        <Bullets items={s.points} />
                      </div>
                    </section>
                  </Reveal>
                </li>
              ))}
            </ul>
            <p className="mt-10 max-w-2xl text-[15px] leading-relaxed text-graphite-secondary">{SECURITY_CLOSING}</p>
            <p className="mt-4 text-sm text-graphite-secondary">
              See how this fits into daily operations on the <Link className="font-medium text-accent-600 hover:underline" href="/platform">platform page</Link>, or{' '}
              <Link className="font-medium text-accent-600 hover:underline" href="/contact">contact us</Link> with questions.
            </p>
          </Container>
        </section>
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
