import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { PilotTimeline } from '@/components/marketing/PilotTimeline'
import { FinalCta } from '@/components/marketing/FinalCta'
import { pageMetadata } from '@/lib/config/site'
import { PILOT_IS, PILOT_IS_NOT, PILOT_TERMS } from '@/lib/content/site'

export const metadata = pageMetadata({
  title: 'How It Works',
  description: 'How a GCO 7-day pilot runs: discovery and feasibility, setup, a live pilot, a performance review, then scaling.',
  path: '/how-it-works',
})

export const revalidate = 600

export default function HowItWorksPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-16 sm:py-20">
            <Eyebrow tone="dark">How It Works</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              From first conversation to a running operation, through a 7-day pilot.
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
              The pilot is how we prove the operation on your real workflow before you commit to scaling it.
            </p>
            {PILOT_TERMS.length > 0 && <p className="mt-3 max-w-2xl text-[14.5px] text-white/60">{PILOT_TERMS.join(' ')}</p>}
          </Container>
        </section>

        <section className="bg-paper py-16 sm:py-20">
          <Container className="max-w-4xl">
            <PilotTimeline />

            <div className="mt-16 grid gap-8 sm:grid-cols-2">
              <div className="rounded-2xl border border-paper-border bg-paper-surface p-7">
                <h2 className="font-display text-base font-semibold text-graphite">What the pilot is</h2>
                <ul className="mt-4 space-y-3">
                  {PILOT_IS.map((item) => (
                    <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-graphite-secondary">
                      <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent-500" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-paper-border bg-paper-surface p-7">
                <h2 className="font-display text-base font-semibold text-graphite">What it is not</h2>
                <ul className="mt-4 space-y-3">
                  {PILOT_IS_NOT.map((item) => (
                    <li key={item} className="flex gap-3 text-[14px] leading-relaxed text-graphite-secondary">
                      <span className="mt-2 h-1 w-1 flex-none rounded-full bg-graphite-muted" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Container>
        </section>

        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
