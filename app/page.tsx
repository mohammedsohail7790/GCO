import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow, SectionHeader } from '@/components/marketing/SectionHeader'
import { OperationsFlow } from '@/components/marketing/OperationsFlow'
import { LinkCards, SupervisionEscalation } from '@/components/marketing/Blocks'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'
import { HumanAiInfrastructure } from '@/components/marketing/HumanAiInfrastructure'
import { PilotTimeline } from '@/components/marketing/PilotTimeline'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PilotCtaLink, BookCallLink } from '@/components/marketing/CtaLinks'
import { Reveal } from '@/components/marketing/Reveal'
import { pageMetadata } from '@/lib/config/site'
import { JsonLd } from '@/components/seo/JsonLd'
import { organizationJsonLd, websiteJsonLd } from '@/lib/seo/jsonld'
import { publishedArticles } from '@/lib/content/resources'
import { CAPABILITY_STRIP, DESCRIPTIONS, HERO, PILOT_PROMISES } from '@/lib/content/site'

// Fully static public page: it no longer reads the login session (authenticated
// users are routed by /home after login). `revalidate` lets the Book-a-Call
// destination pick up CALENDLY_SCHEDULING_URL at runtime without a rebuild.
export const revalidate = 600

export const metadata = pageMetadata({
  title: 'Managed Conversation Operations',
  description: DESCRIPTIONS.home,
  path: '/',
})

const PROBLEMS = [
  'Message volume grows faster than your team can hire',
  'Response quality drifts once more than one person is answering',
  'Conversations get missed outside the hours your team works',
  'Routing and escalation happen manually, if at all',
  'There is no real visibility into what is actually happening',
]

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink text-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 900px 500px at 15% -10%, rgba(61,63,219,0.28), transparent 60%)' }}
          />
          <Container className="relative grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8 lg:py-28">
            <div className="animate-fade-up">
              <Eyebrow tone="dark">{HERO.eyebrow}</Eyebrow>
              <h1 className="font-display mt-5 max-w-xl text-[2.25rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                {HERO.headlineLead}
                <span className="block text-accent-100">{HERO.headlineTail}</span>
              </h1>
              <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-white/65 sm:text-[17px]">{HERO.body}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <PilotCtaLink location="hero" />
                <BookCallLink location="hero" />
              </div>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-white/55">
                {PILOT_PROMISES.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-accent-400" aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-white/40">{HERO.note}</p>
            </div>

            <div className="flex animate-fade-in justify-center lg:justify-end" style={{ animationDelay: '0.15s' }}>
              <OperationsFlow />
            </div>
          </Container>
        </section>

        {/* Capability strip - wording gated by lib/content/site.ts CLAIMS; no logos, no metrics */}
        <section className="border-b border-paper-border bg-paper-surface">
          <Container className="py-7">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              {CAPABILITY_STRIP.map((item) => (
                <li key={item} className="text-center text-[13px] font-medium text-graphite-secondary">
                  {item}
                </li>
              ))}
            </ul>
          </Container>
        </section>

        {/* Problem */}
        <section className="bg-paper py-20 sm:py-24">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <Reveal>
                <SectionHeader
                  eyebrow="The problem"
                  title="Conversations don't scale themselves."
                  description="Growing message volume, inconsistent response quality, and no operational visibility - the usual result of trying to run conversations without a dedicated operations layer behind them."
                />
              </Reveal>
              <Reveal delay={80}>
                <div className="rounded-2xl border border-paper-border bg-paper-surface p-7 sm:p-8">
                  <ul className="space-y-4">
                    {PROBLEMS.map((p) => (
                      <li key={p} className="flex gap-3 text-[14.5px] text-graphite-secondary">
                        <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent-500" aria-hidden="true" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            </div>
          </Container>
        </section>

        <HumanAiInfrastructure />

        {/* Pilot process */}
        <section className="border-t border-paper-border bg-paper-surface py-20 sm:py-24">
          <Container>
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <SectionHeader
                  eyebrow="The 7-day pilot"
                  title="Evaluate the operation on your real workflow."
                  description="A scoped, monitored pilot: agreed in advance, run for seven days, and reviewed together at the end."
                />
                <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-start">
                  <PilotCtaLink location="pilot-section" />
                  <Link href="/how-it-works" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
                    See the full process →
                  </Link>
                </div>
              </div>
              <PilotTimeline />
            </div>
          </Container>
        </section>

        {/* Services */}
        <section className="bg-paper py-20 sm:py-24">
          <Container>
            <SectionHeader eyebrow="What we run" title="Six services, one supervised operating model" />
            <div className="mt-12">
              <LinkCards items={SERVICES.map((s) => ({ href: `/services/${s.slug}`, title: s.name, body: s.short }))} />
            </div>
          </Container>
        </section>

        <SupervisionEscalation />

        {/* Industries + platform */}
        <section className="border-t border-paper-border bg-paper-surface py-20 sm:py-24">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <div>
                <SectionHeader eyebrow="Industries" title="Chat operations for businesses that live in conversation." description="Dating & Social is our strongest initial specialisation; the same model serves communities, SaaS, e-commerce and digital platforms." />
                <ul className="mt-6 space-y-2">
                  {INDUSTRIES.map((i) => (
                    <li key={i.slug}>
                      <Link href={`/industries/${i.slug}`} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-graphite transition-colors hover:text-accent-600">
                        {i.name} <span aria-hidden="true" className="ml-2 text-accent-600">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <SectionHeader eyebrow="Platform" title="A real operations platform behind the workforce." description="Live queues, assignment, response timers, supervisor visibility, escalation and reporting - with AI assisting the operator, and a human sending every reply." />
                <Link href="/platform" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
                  Explore the platform <span aria-hidden="true" className="ml-2">→</span>
                </Link>
              </div>
            </div>
          </Container>
        </section>

        {/* Resources teaser: three guides, no card wall */}
        <section className="bg-paper py-20 sm:py-24">
          <Container>
            <SectionHeader eyebrow="Resources" title="Practical guides on running conversation operations." />
            <div className="mt-10">
              <LinkCards items={publishedArticles().slice(0, 3).map((a) => ({ href: `/resources/${a.slug}`, title: a.title, body: a.description }))} />
            </div>
            <Link href="/resources" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
              All resources <span aria-hidden="true" className="ml-2">→</span>
            </Link>
          </Container>
        </section>

        <FinalCta />

        <section className="bg-paper py-10">
          <Container>
            <p className="text-sm text-graphite-secondary">
              Want to join GCO?{' '}
              <Link href="/careers" className="font-semibold text-ink underline-offset-2 transition-colors hover:text-accent-600 hover:underline">
                View opportunities →
              </Link>
            </p>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
