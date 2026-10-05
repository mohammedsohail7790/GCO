import { Container } from './Container'
import { Eyebrow } from './SectionHeader'
import { Reveal } from './Reveal'
import { PILLARS } from '@/lib/content/site'

// The core GCO concept the rest of the site is an instance of: people do the
// conversation work; AI assists them; infrastructure and supervision keep it
// consistent at volume. Typography-led rather than a card grid. Copy lives in
// lib/content/site.ts (PILLARS) so it stays consistent with the hero.
export function HumanAiInfrastructure() {
  return (
    <section className="bg-ink py-20 text-white sm:py-24">
      <Container>
        <Eyebrow tone="dark">What GCO actually is</Eyebrow>
        <Reveal>
          <h2 className="font-display mt-5 max-w-3xl text-2xl font-semibold leading-snug sm:text-3xl">
            Human-led conversation operations, with technology doing the supporting work.
          </h2>
          <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-white/60">
            People hold your conversations. AI helps them work faster and more consistently, but it never sends a
            message: a human operator reviews and sends every reply.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal key={p.label} delay={i * 70} className="bg-ink">
              <div className="h-full p-6 transition-colors duration-300 hover:bg-ink-800">
                <span className="font-display text-xs font-semibold tabular-nums text-accent-400">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="font-display mt-3 text-[15.5px] font-semibold text-white/95">{p.label}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
