import { Container } from './Container'
import { PilotCtaLink, BookCallLink } from './CtaLinks'
import { Reveal } from './Reveal'
import { CTA, FINAL_CTA, PILOT_TERMS } from '@/lib/content/site'

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink py-24 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 700px 380px at 85% 110%, rgba(61,63,219,0.30), transparent 60%)' }}
      />
      <Container className="relative">
        <Reveal>
          <h2 className="font-display max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{FINAL_CTA.title}</h2>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/65">{FINAL_CTA.body}</p>
          {PILOT_TERMS.length > 0 && <p className="mt-3 max-w-xl text-[14px] text-white/55">{PILOT_TERMS.join(' ')}</p>}
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <PilotCtaLink label={CTA.pilotFinal} location="final-cta" />
            <BookCallLink location="final-cta" />
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
