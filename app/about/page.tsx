import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'About',
  description: 'GCO builds and manages human conversation operations teams - our approach to people, technology, and quality.',
  path: '/about',
})

// A belief, not a feature - each one answers "why," not "what." Deliberately
// typography-led (large statement + short response) rather than a symmetric
// card grid, per the Phase 14 request to give About a genuine point of view
// instead of reading as four generic value-prop tiles.
const BELIEFS = [
  {
    statement: 'Conversations are where trust is won or lost.',
    body: 'A missed message or an inconsistent reply costs more than the conversation itself - it costs the relationship behind it. That’s why we treat conversation operations as a discipline, not an afterthought.',
  },
  {
    statement: 'Judgment doesn’t scale by hiring faster.',
    body: 'Volume grows faster than most teams can hire and train for. The answer isn’t fewer standards under pressure - it’s an operation built to hold the line as it grows.',
  },
  {
    statement: 'Technology should make operators better, not replace them.',
    body: 'AI-assisted workflows support our operators - drafting, routing, surfacing context - so people spend their judgment on what actually needs it, not on repetitive lookup work.',
  },
  {
    statement: 'Consistency is a system, not a personality trait.',
    body: 'Good conversations shouldn’t depend on which operator is on shift. Every operation runs against defined standards, with supervision and feedback built in from day one, not bolted on later.',
  },
]

export const revalidate = 600

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">About GCO</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              A managed human operations company for conversations.
            </h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-white/70">
              GCO builds and runs the human operations layer behind chat, conversation engagement, and moderation for
              businesses that need reliable coverage without building and managing an in-house team themselves. We
              handle staffing, training, and supervision so your conversations get consistent, on-brand attention.
            </p>
            <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-white/70">
              GCO is a new, ambitious, technology-enabled BPO built for modern conversation operations. We would
              rather prove ourselves on your real workflow, through a scoped pilot, than ask you to take our size on
              trust.
            </p>
          </Container>
        </section>

        <section className="bg-paper py-24">
          <Container>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-accent-600">What we believe</p>
            <div className="mt-10 divide-y divide-paper-border">
              {BELIEFS.map((b, i) => (
                <div key={b.statement} className="grid gap-4 py-10 first:pt-0 last:pb-0 sm:grid-cols-[1fr_1.2fr] sm:gap-12">
                  <div className="flex items-start gap-4">
                    <span className="font-display text-xs font-semibold tabular-nums text-graphite-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h2 className="font-display text-xl font-semibold leading-snug text-graphite sm:text-2xl">
                      {b.statement}
                    </h2>
                  </div>
                  <p className="text-[14.5px] leading-relaxed text-graphite-secondary sm:pt-1">{b.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-16 max-w-2xl border-t border-paper-border pt-10">
              <h2 className="font-display text-lg font-semibold text-graphite">Why software and managed operations, together</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-graphite-secondary">
                Software alone doesn&apos;t run an operation - it can route a message, but it can&apos;t exercise
                judgment, de-escalate a frustrated customer, or know when a policy needs a human exception. People do
                that, with the right systems behind them: routing, CRM, monitoring, and reporting that make consistent
                execution possible at real volume. That combination - not one replacing the other - is what GCO runs.
              </p>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
