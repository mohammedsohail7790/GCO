import Link from 'next/link'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow, SectionHeader } from '@/components/marketing/SectionHeader'
import { OperationsFlow } from '@/components/marketing/OperationsFlow'
import { ServiceCard } from '@/components/marketing/ServiceCard'
import { HumanAiInfrastructure } from '@/components/marketing/HumanAiInfrastructure'
import { PilotTimeline } from '@/components/marketing/PilotTimeline'
import { FinalCta } from '@/components/marketing/FinalCta'
import { PilotCtaLink, BookCallLink } from '@/components/marketing/CtaLinks'
import { Reveal } from '@/components/marketing/Reveal'
import { pageMetadata } from '@/lib/config/site'
import { CAPABILITY_STRIP, DESCRIPTIONS, HERO, PILOT_TERMS } from '@/lib/content/site'

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

const SERVICES = [
  { title: 'Chat Operations', body: 'Real-time conversation handling across your channels.' },
  { title: 'Conversation Engagement', body: 'Keeping conversations active, responsive, and on-brand.' },
  { title: 'Content & Chat Moderation', body: 'Consistent moderation aligned to your standards.' },
  { title: 'Customer Support Operations', body: 'Trained operators handling day-to-day support volume.' },
]

// Only capabilities that exist in the operations platform today.
const VISIBILITY = [
  { title: 'Queues & assignment', body: 'Incoming conversations are queued and assigned to available operators, with race-safe assignment.' },
  { title: 'Response timers', body: 'Every assignment carries a response deadline that the system tracks and enforces.' },
  { title: 'Reassignment', body: 'Work can be reassigned manually, and expired assignments are released back to the queue.' },
  { title: 'Operator status & workload', body: 'Operator availability and capacity are visible to the managers overseeing the operation.' },
]

export default function Home() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
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
              <p className="mt-5 max-w-lg text-[13px] leading-relaxed text-white/45">
                {PILOT_TERMS.length > 0 ? `${PILOT_TERMS.join(' ')} ` : ''}
                {HERO.note}
              </p>
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
                  <Link href="/how-it-works" className="py-2 text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
                    See the full process →
                  </Link>
                </div>
              </div>
              <PilotTimeline />
            </div>
          </Container>
        </section>

        {/* What we run */}
        <section className="bg-paper py-20 sm:py-24">
          <Container>
            <SectionHeader eyebrow="What we run" title="Operations, run for you" />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s, i) => (
                <Reveal key={s.title} delay={i * 60}>
                  <ServiceCard index={i} title={s.title} body={s.body} />
                </Reveal>
              ))}
            </div>
            <Link href="/services" className="mt-8 inline-block py-2 text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
              View all services →
            </Link>
          </Container>
        </section>

        {/* Supervision & visibility - verified platform capabilities only */}
        <section className="border-t border-paper-border bg-paper-surface py-20 sm:py-24">
          <Container>
            <SectionHeader
              eyebrow="Supervision & visibility"
              title="An operation you can see, not just staff."
              description="The operations platform gives managers live visibility and control over the work, so supervision is part of how the operation runs."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {VISIBILITY.map((v, i) => (
                <Reveal key={v.title} delay={i * 60}>
                  <div className="h-full rounded-2xl border border-paper-border bg-paper p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel">
                    <h3 className="font-display text-[15.5px] font-semibold text-graphite">{v.title}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-graphite-secondary">{v.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
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
