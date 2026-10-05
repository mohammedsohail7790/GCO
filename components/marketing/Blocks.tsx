import Link from 'next/link'
import { Container } from './Container'
import { Eyebrow, SectionHeader } from './SectionHeader'
import { Reveal } from './Reveal'
import { PilotCtaLink, BookCallLink } from './CtaLinks'
import { ESCALATION_RECORDED, ESCALATION_STEPS, ESCALATION_WHEN, SUPERVISION_QA } from '@/lib/content/escalation'
import { PILOT_PROMISES, STAFFING_NOTE } from '@/lib/content/site'
import type { Faq } from '@/lib/content/services'

export function Bullets({ items, tone = 'light' }: { items: readonly string[]; tone?: 'light' | 'dark' }) {
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i} className={`flex gap-3 text-[14.5px] leading-relaxed ${tone === 'dark' ? 'text-white/70' : 'text-graphite-secondary'}`}>
          <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-accent-500" aria-hidden="true" />
          {i}
        </li>
      ))}
    </ul>
  )
}

export function CardGrid({ items, cols = 3 }: { items: readonly { title: string; body: string }[]; cols?: 2 | 3 | 4 }) {
  const c = cols === 4 ? 'lg:grid-cols-4' : cols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
  return (
    <div className={`grid gap-5 sm:grid-cols-2 ${c}`}>
      {items.map((it, i) => (
        <Reveal key={it.title} delay={i * 50}>
          <div className="h-full rounded-2xl border border-paper-border bg-paper-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel">
            <h3 className="font-display text-[15.5px] font-semibold text-graphite">{it.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-graphite-secondary">{it.body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

export function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="space-y-4">
      {items.map((s, i) => (
        <li key={s} className="flex gap-4">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-paper-border bg-paper-surface font-display text-[12px] font-semibold text-accent-600" aria-hidden="true">
            {i + 1}
          </span>
          <p className="pt-1 text-[14.5px] leading-relaxed text-graphite-secondary">{s}</p>
        </li>
      ))}
    </ol>
  )
}

/** Supervision & QA + the approved three-level escalation workflow. */
export function SupervisionEscalation() {
  return (
    <section className="bg-ink py-16 text-white sm:py-20">
      <Container>
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <Eyebrow tone="dark">{SUPERVISION_QA.title}</Eyebrow>
            <h2 className="font-display mt-3 text-2xl font-semibold sm:text-3xl">Supervised work, with a defined escalation path.</h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/60">{SUPERVISION_QA.body}</p>
            <div className="mt-6">
              <Bullets items={SUPERVISION_QA.points} tone="dark" />
            </div>
          </div>
          <div>
            <Eyebrow tone="dark">Escalation</Eyebrow>
            <ol className="mt-4 space-y-0">
              {ESCALATION_STEPS.map((s, i) => (
                <li key={s.level} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < ESCALATION_STEPS.length - 1 && <span className="absolute left-[15px] top-9 h-[calc(100%-1.5rem)] w-px bg-white/15" aria-hidden="true" />}
                  <span className="relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-white/20 bg-ink-800 font-display text-[12px] font-semibold text-accent-100" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-white">{s.level}</h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-white/55">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-[13px] font-medium text-white/70">Escalate when:</p>
            <ul className="mt-2 grid gap-1.5 text-[13.5px] text-white/55 sm:grid-cols-2">
              {ESCALATION_WHEN.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 flex-none rounded-full bg-accent-400" aria-hidden="true" />
                  {w}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] leading-relaxed text-white/45">{ESCALATION_RECORDED}</p>
          </div>
        </div>
      </Container>
    </section>
  )
}

export function PilotCallout({ text, location }: { text: string; location: string }) {
  return (
    <section className="border-t border-paper-border bg-paper-surface py-16 sm:py-20">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <SectionHeader eyebrow="The 7-day pilot" title="What the pilot looks like" description={text} />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PilotCtaLink location={location} />
              <BookCallLink variant="ghostLight" location={location} />
            </div>
          </div>
          <div className="rounded-2xl border border-paper-border bg-paper p-7">
            <Bullets items={PILOT_PROMISES} />
            <p className="mt-5 border-t border-paper-border pt-4 text-[13px] leading-relaxed text-graphite-muted">{STAFFING_NOTE}</p>
          </div>
        </div>
      </Container>
    </section>
  )
}

export function FaqList({ faqs }: { faqs: readonly Faq[] }) {
  return (
    <div className="divide-y divide-paper-border rounded-2xl border border-paper-border bg-paper-surface">
      {faqs.map((f) => (
        <details key={f.q} className="group p-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display text-[15px] font-semibold text-graphite [&::-webkit-details-marker]:hidden">
            {f.q}
            <span aria-hidden="true" className="text-accent-600 transition-transform duration-200 group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-[14.5px] leading-relaxed text-graphite-secondary">{f.a}</p>
        </details>
      ))}
    </div>
  )
}

export function LinkCards({ items }: { items: readonly { href: string; title: string; body: string }[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className="group flex min-h-24 flex-col rounded-2xl border border-paper-border bg-paper-surface p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-panel">
          <h3 className="font-display text-[15.5px] font-semibold text-graphite">{i.title}</h3>
          <p className="mt-2 flex-1 text-[14px] leading-relaxed text-graphite-secondary">{i.body}</p>
          <span className="mt-4 text-sm font-semibold text-accent-600 transition-colors group-hover:text-accent-700">
            Learn more <span aria-hidden="true">→</span>
          </span>
        </Link>
      ))}
    </div>
  )
}

export function SectionBlock({ children, tone = 'paper', eyebrow, title, description }: { children: React.ReactNode; tone?: 'paper' | 'surface'; eyebrow?: string; title?: string; description?: string }) {
  return (
    <section className={`py-16 sm:py-20 ${tone === 'surface' ? 'border-t border-paper-border bg-paper-surface' : 'bg-paper'}`}>
      <Container>
        {title && <SectionHeader eyebrow={eyebrow} title={title} description={description} />}
        <div className={title ? 'mt-10' : ''}>{children}</div>
      </Container>
    </section>
  )
}
