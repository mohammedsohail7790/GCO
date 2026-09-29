import { redirect } from 'next/navigation'
import Link from 'next/link'
import { tryGetSession } from '@/lib/auth/session'
import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow, SectionHeader } from '@/components/marketing/SectionHeader'
import { OperationsFlow } from '@/components/marketing/OperationsFlow'
import { ServiceCard } from '@/components/marketing/ServiceCard'
import { HumanAiInfrastructure } from '@/components/marketing/HumanAiInfrastructure'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'
import { pageMetadata } from '@/lib/config/site'

const ROLE_HOME: Record<string, string> = {
  CEO_ADMIN: '/admin',
  MANAGER: '/manager',
  ASSISTANT: '/manager',
  OPERATOR: '/operator',
  CLIENT: '/client-panel',
  HUNTER: '/hunter',
}

export const metadata = pageMetadata({
  title: 'Managed Conversation Operations',
  description:
    'GCO provides trained, supervised human operator teams for chat operations, conversation engagement, and moderation - 24/7, multilingual, and built to scale with your business.',
  path: '/',
})

const CAPABILITIES = ['24/7 coverage', 'Multilingual operators', 'Trained teams', 'Supervision & QA', 'Scalable staffing', 'Managed operations']

const PROBLEMS = [
  'Message volume grows faster than your team can hire',
  'Response quality drifts once more than one person is answering',
  'Conversations get missed outside business hours',
  'Routing and escalation happen manually, if at all',
  'There is no real visibility into what is actually happening',
]

const SERVICES = [
  { title: 'Chat Operations', body: 'Real-time conversation handling across your channels.' },
  { title: 'Conversation Engagement', body: 'Keeping conversations active, responsive, and on-brand.' },
  { title: 'Content & Chat Moderation', body: 'Consistent moderation aligned to your standards.' },
  { title: 'Customer Support Operations', body: 'Trained operators handling day-to-day support volume.' },
]

export default async function Home() {
  const session = await tryGetSession()
  if (session) redirect(ROLE_HOME[session.role] ?? '/login')

  const bookingUrl = getCalendarProvider().getBookingUrl()

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink text-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 900px 500px at 15% -10%, rgba(61,63,219,0.28), transparent 60%)',
            }}
          />
          <Container className="relative grid gap-16 py-24 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-8">
            <div className="animate-fade-up">
              <Eyebrow tone="dark">Global Conversation Operations</Eyebrow>
              <h1 className="font-display mt-5 max-w-xl text-[2.75rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Conversation operations, built for scale.
              </h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/65">
                GCO combines trained, supervised human operators with AI-assisted workflows to run the conversation
                operations layer behind your business - chat, engagement, support, and moderation, handled reliably
                as you grow.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                {bookingUrl ? (
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
                    Book a Call
                  </a>
                ) : (
                  <Link href="/contact" className="rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-600">
                    Book a Call
                  </Link>
                )}
                <Link href="/how-it-works" className="text-sm font-semibold text-white/80 transition-colors hover:text-white">
                  See How It Works →
                </Link>
              </div>
            </div>

            <div className="flex animate-fade-in justify-center lg:justify-end" style={{ animationDelay: '0.15s' }}>
              <OperationsFlow />
            </div>
          </Container>
        </section>

        {/* Trust / credibility strip - factual capabilities only, no fabricated logos or metrics */}
        <section className="border-b border-paper-border bg-paper-surface">
          <Container className="py-8">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
              {CAPABILITIES.map((item) => (
                <div key={item} className="text-center text-[13px] font-medium text-graphite-secondary">
                  {item}
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* Problem */}
        <section className="bg-paper py-24">
          <Container>
            <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
              <SectionHeader
                eyebrow="The problem"
                title="Conversations don't scale themselves."
                description="Growing message volume, inconsistent response quality, and no operational visibility - the usual result of trying to run conversations without a dedicated operations layer behind them."
              />
              <div className="rounded-2xl border border-paper-border bg-paper-surface p-8">
                <ul className="space-y-4">
                  {PROBLEMS.map((p) => (
                    <li key={p} className="flex gap-3 text-[14.5px] text-graphite-secondary">
                      <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent-500" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        <HumanAiInfrastructure />

        {/* How it works, brief */}
        <section className="border-t border-paper-border bg-paper-surface py-24">
          <Container>
            <SectionHeader
              eyebrow="How GCO works"
              title="An operations layer, not a headcount"
              description="We take the time to understand what your conversations actually need, then build and run the human operations behind them - so you get reliable coverage without hiring, training, and managing an in-house team yourself."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {[
                { step: '01', title: 'Onboarding & requirements', body: 'We learn your workflows, tone, tools, and coverage needs.' },
                { step: '02', title: 'Team setup & training', body: 'Operators are staffed, trained, and equipped for your specific operation.' },
                { step: '03', title: 'Supervision & reporting', body: 'Ongoing quality control, supervision, and reporting as you scale.' },
              ].map((s) => (
                <div key={s.step} className="rounded-2xl border border-paper-border bg-paper p-6">
                  <span className="font-display text-xs font-semibold tabular-nums text-graphite-muted">{s.step}</span>
                  <h3 className="font-display mt-3 text-[15.5px] font-semibold text-graphite">{s.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-graphite-secondary">{s.body}</p>
                </div>
              ))}
            </div>
            <Link href="/how-it-works" className="mt-8 inline-block text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
              See the full process →
            </Link>
          </Container>
        </section>

        {/* Services overview */}
        <section className="bg-paper py-24">
          <Container>
            <SectionHeader eyebrow="What we run" title="Operations, run for you" />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICES.map((s, i) => (
                <ServiceCard key={s.title} index={i} title={s.title} body={s.body} />
              ))}
            </div>
            <Link href="/services" className="mt-8 inline-block text-sm font-semibold text-accent-600 transition-colors hover:text-accent-700">
              View all services →
            </Link>
          </Container>
        </section>

        {/* Trust / quality */}
        <section className="border-t border-paper-border bg-paper-surface py-24">
          <Container>
            <SectionHeader
              eyebrow="Quality"
              title="Built on supervision and quality control"
              description="Every operator team is supervised, every conversation is subject to quality review, and every operation is set up to scale up or down as your needs change - not a one-size-fits-all outsourcing arrangement."
            />
          </Container>
        </section>

        {/* Closing - editorial statement + two inline paths, not two boxed
            CTA cards (the previous card-pair pattern was identified as the
            weakest, most generic section on the page during Phase 14 audit). */}
        <section className="border-t border-paper-border bg-paper py-24">
          <Container>
            <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight text-graphite sm:text-4xl">
              Ready to operate your conversations differently?
            </h2>
            <div className="mt-10 flex flex-col gap-x-12 gap-y-6 sm:flex-row">
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-graphite-muted">Looking for BPO support</p>
                {bookingUrl ? (
                  <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-display text-lg font-semibold text-ink transition-colors hover:text-accent-600">
                    Book a Call →
                  </a>
                ) : (
                  <Link href="/contact" className="mt-2 inline-block font-display text-lg font-semibold text-ink transition-colors hover:text-accent-600">
                    Contact Us →
                  </Link>
                )}
              </div>
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.1em] text-graphite-muted">Want to join GCO</p>
                <Link href="/careers" className="mt-2 inline-block font-display text-lg font-semibold text-ink transition-colors hover:text-accent-600">
                  View Opportunities →
                </Link>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
