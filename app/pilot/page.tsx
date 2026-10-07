import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { PilotForm } from '@/components/marketing/PilotForm'
import { PilotTimeline } from '@/components/marketing/PilotTimeline'
import { BookCallTextLink } from '@/components/marketing/CtaLinks'
import { pageMetadata } from '@/lib/config/site'
import { CTA, PILOT_IS, PILOT_TERMS, PUBLIC_EMAIL } from '@/lib/content/site'

export const metadata = pageMetadata({
  title: 'Start a 7-Day Pilot',
  description: 'Request a scoped 7-day pilot of GCO managed conversation operations with your real workflow.',
  path: '/pilot',
})

export const revalidate = 600

export default function PilotPage() {
  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-16 sm:py-20">
            <Eyebrow tone="dark">7-day pilot</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Test GCO with your real workflow.
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
              Tell us a little about your operation. We&apos;ll follow up to scope the pilot together: channels,
              volume, languages and coverage are agreed before Day 1.
            </p>
            {PILOT_TERMS.length > 0 && <p className="mt-3 max-w-2xl text-[14.5px] text-white/60">{PILOT_TERMS.join(' ')}</p>}
          </Container>
        </section>

        <section className="bg-paper py-16 sm:py-20">
          <Container>
            <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
              <div className="rounded-2xl border border-paper-border bg-paper-surface p-6 shadow-card sm:p-9">
                <h2 className="font-display text-lg font-semibold text-graphite">{CTA.pilot}</h2>
                <p className="mt-2 text-[14.5px] text-graphite-secondary">
                  Two details are required. The rest helps us prepare for the discovery conversation.
                </p>
                <div className="mt-6">
                  <PilotForm />
                </div>
              </div>

              <aside className="space-y-10">
                <div>
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
                <div>
                  <h2 className="font-display text-base font-semibold text-graphite">What happens next</h2>
                  <div className="mt-5">
                    <PilotTimeline />
                  </div>
                </div>
                <p className="text-sm text-graphite-secondary">
                  Prefer to talk first? <BookCallTextLink location="pilot-page" /> - a 30-minute conversation about your operation.
                </p>
                <p className="text-sm text-graphite-secondary">
                  Prefer email? Write to{' '}
                  <a className="font-medium text-accent-600 underline-offset-2 hover:underline" href={`mailto:${PUBLIC_EMAIL}`}>
                    {PUBLIC_EMAIL}
                  </a>
                  .
                </p>
              </aside>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
