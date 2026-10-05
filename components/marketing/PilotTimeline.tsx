import { PILOT_STEPS } from '@/lib/content/site'
import { Reveal } from './Reveal'

// The real pilot process (docs/7-day-pilot.md), rendered from lib/content/site.ts.
export function PilotTimeline({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark'
  return (
    <ol className="relative">
      {PILOT_STEPS.map((step, i) => (
        <li key={step.title} className="relative flex gap-5 pb-9 last:pb-0 sm:gap-6">
          {i < PILOT_STEPS.length - 1 && (
            <span
              className={`absolute left-[19px] top-11 h-[calc(100%-1.75rem)] w-px ${dark ? 'bg-white/15' : 'bg-paper-border'}`}
              aria-hidden="true"
            />
          )}
          <span
            className={`relative z-10 flex h-10 w-10 flex-none items-center justify-center rounded-full border font-display text-[12px] font-semibold tabular-nums ${
              dark ? 'border-white/20 bg-ink-800 text-accent-100' : 'border-paper-border bg-paper-surface text-accent-600'
            }`}
            aria-hidden="true"
          >
            {i}
          </span>
          <Reveal delay={i * 60} className="pt-0.5">
            <p className={`font-display text-[11px] font-semibold uppercase tracking-[0.12em] ${dark ? 'text-accent-100' : 'text-accent-600'}`}>
              {step.marker}
            </p>
            <h3 className={`font-display mt-1 text-[16px] font-semibold ${dark ? 'text-white' : 'text-graphite'}`}>{step.title}</h3>
            <p className={`mt-1.5 max-w-xl text-[14.5px] leading-relaxed ${dark ? 'text-white/60' : 'text-graphite-secondary'}`}>{step.body}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}
