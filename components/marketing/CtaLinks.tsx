import Link from 'next/link'
import { CTA, PILOT_PATH } from '@/lib/content/site'
import { getBookCallTarget } from '@/lib/config/scheduling'

// All primary/secondary calls to action render through these two components so
// labels, destinations and the Calendly-or-contact fallback live in one place.
// `data-cta` / `data-cta-location` are stable hooks for future analytics.

type Variant = 'accent' | 'ink' | 'ghostDark' | 'ghostLight'

const base =
  'group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]'

const VARIANTS: Record<Variant, string> = {
  accent: 'bg-accent-500 text-white hover:bg-accent-600 hover:shadow-elevated',
  ink: 'bg-ink text-paper hover:bg-ink-700',
  ghostDark: 'border border-white/20 text-white hover:border-white/40 hover:bg-white/5',
  ghostLight: 'border border-paper-border bg-paper-surface text-graphite hover:border-graphite-muted',
}

function Arrow() {
  return (
    <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">
      →
    </span>
  )
}

export function PilotCtaLink({
  variant = 'accent',
  label = CTA.pilot,
  location,
  className = '',
  onClick,
  kind = 'pilot',
}: {
  variant?: Variant
  label?: string
  location: string
  className?: string
  onClick?: () => void
  /** Analytics kind (data-cta): 'pilot' by default, 'resource' for CTAs inside articles. */
  kind?: 'pilot' | 'resource'
}) {
  return (
    <Link
      href={PILOT_PATH}
      onClick={onClick}
      data-cta={kind}
      data-cta-location={location}
      className={`${base} ${VARIANTS[variant]} ${className}`}
    >
      {label}
      <Arrow />
    </Link>
  )
}

export function BookCallLink({
  variant = 'ghostDark',
  label = CTA.bookCall,
  location,
  className = '',
  onClick,
  kind = 'book-call',
}: {
  variant?: Variant
  label?: string
  location: string
  className?: string
  onClick?: () => void
  kind?: 'book-call' | 'resource'
}) {
  const target = getBookCallTarget()
  const cls = `${base} ${VARIANTS[variant]} ${className}`
  const data = { 'data-cta': kind, 'data-cta-location': location }
  if (target.external) {
    return (
      <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls} {...data}>
        {label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return (
    <Link href={target.href} onClick={onClick} className={cls} {...data}>
      {label}
    </Link>
  )
}
