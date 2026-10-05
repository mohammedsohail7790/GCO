import { SiteHeader } from '@/components/marketing/SiteHeader'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { Container } from '@/components/marketing/Container'
import { Eyebrow } from '@/components/marketing/SectionHeader'
import { CareerApplicationForm } from '@/components/marketing/CareerApplicationForm'
import { pageMetadata } from '@/lib/config/site'

export const metadata = pageMetadata({
  title: 'Careers',
  description: 'Join GCO as an operator - reliable, skilled people handling chat operations, engagement, and moderation.',
  path: '/careers',
})

const WHAT_WE_LOOK_FOR = [
  'Clear, reliable communication',
  'Consistency and reliability with schedules',
  'Strong language skills in your working language(s)',
  'Ability to follow defined workflows and guidelines',
  'Attention to quality and detail',
  'Comfort working in a supervised, feedback-driven environment',
]

export const revalidate = 600

export default function CareersPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="border-b border-paper-border bg-ink text-white">
          <Container className="py-20">
            <Eyebrow tone="dark">Join Our Team</Eyebrow>
            <h1 className="font-display mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              We&apos;re always looking for reliable operators.
            </h1>
            <p className="mt-5 max-w-2xl text-[15.5px] leading-relaxed text-white/65">
              GCO operators handle real conversations for real businesses. We look for people who communicate well,
              show up consistently, and take quality seriously.
            </p>
          </Container>
        </section>

        <section className="bg-paper py-20">
          <Container>
            <div className="grid gap-14 lg:grid-cols-2">
              <div>
                <h2 className="font-display text-lg font-semibold text-graphite">What we look for</h2>
                <ul className="mt-6 space-y-3.5">
                  {WHAT_WE_LOOK_FOR.map((item) => (
                    <li key={item} className="flex gap-3 text-[14.5px] text-graphite-secondary">
                      <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent-500" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-9 rounded-2xl border border-paper-border bg-paper-surface p-6">
                  <h3 className="font-display text-sm font-semibold text-graphite">Training and onboarding</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-graphite-secondary">
                    Every operator is trained against the specific workflows and standards of the operation they join
                    before handling live conversations, with ongoing supervision and feedback after that.
                  </p>
                </div>

                <p className="mt-6 text-xs leading-relaxed text-graphite-muted">
                  Roles, hours, and compensation vary by operation and are confirmed individually during the
                  application process - nothing on this page is a specific offer of employment or pay.
                </p>
              </div>

              <div className="rounded-2xl border border-paper-border bg-paper-surface p-8 shadow-card sm:p-9">
                <h2 className="font-display text-lg font-semibold text-graphite">Apply</h2>
                <p className="mt-2 text-[14.5px] text-graphite-secondary">Tell us a bit about yourself and we&apos;ll be in touch.</p>
                <div className="relative mt-6">
                  <CareerApplicationForm />
                </div>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}
