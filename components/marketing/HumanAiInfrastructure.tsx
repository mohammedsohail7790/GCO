import { Container } from './Container'
import { Eyebrow } from './SectionHeader'

const PILLARS = [
  { label: 'Human judgment', body: 'Trained, supervised operators handle what requires real judgment, tone, and accountability.' },
  { label: 'AI assistance', body: 'AI-assisted workflows support operators - drafting, routing, and surfacing context - without replacing them.' },
  { label: 'Operational infrastructure', body: 'Routing, CRM, integrations, and monitoring - the systems that make consistent execution possible at volume.' },
]

// The core GCO brand concept the rest of the site should feel like an
// instance of: not "software" and not "an outsourced headcount," but the
// combination of the three. Deliberately typography-led rather than a card
// grid - an equation, not a feature list - per the Phase 14 brief's request
// to make this a recognizable, repeatable concept rather than one line of
// hero copy.
export function HumanAiInfrastructure() {
  return (
    <section className="bg-ink py-24 text-white">
      <Container>
        <Eyebrow tone="dark">What GCO actually is</Eyebrow>
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-4">
          {PILLARS.map((p, i) => (
            <span key={p.label} className="flex items-baseline gap-4">
              <span className="font-display text-2xl font-semibold sm:text-3xl">{p.label}</span>
              {i < PILLARS.length - 1 && <span className="font-display text-2xl text-accent-400 sm:text-3xl">+</span>}
            </span>
          ))}
          <span className="flex items-baseline gap-4">
            <span className="font-display text-2xl text-white/30 sm:text-3xl">=</span>
            <span className="font-display text-2xl font-semibold text-accent-300 sm:text-3xl">Conversation Operations</span>
          </span>
        </div>

        <div className="mt-14 grid gap-10 border-t border-white/10 pt-10 sm:grid-cols-3 sm:gap-8">
          {PILLARS.map((p) => (
            <div key={p.label}>
              <h3 className="font-display text-[15px] font-semibold text-white/90">{p.label}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-white/55">{p.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
