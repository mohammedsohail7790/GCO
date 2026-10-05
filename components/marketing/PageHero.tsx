import Link from 'next/link'
import { Container } from './Container'
import { Eyebrow } from './SectionHeader'
import { PilotCtaLink, BookCallLink } from './CtaLinks'
import { PILOT_PROMISES } from '@/lib/content/site'

export function PageHero({
  eyebrow,
  title,
  lead,
  crumbs,
  ctas = true,
}: {
  eyebrow: string
  title: string
  lead?: string
  crumbs?: { href: string; label: string }[]
  ctas?: boolean
}) {
  return (
    <section className="relative overflow-hidden border-b border-paper-border bg-ink text-white">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 800px 380px at 10% -20%, rgba(61,63,219,0.26), transparent 60%)' }} />
      <Container className="relative py-14 sm:py-20">
        {crumbs && (
          <nav aria-label="Breadcrumb" className="mb-5 text-[13px] text-white/50">
            {crumbs.map((c) => (
              <span key={c.href}>
                <Link href={c.href} className="inline-block py-3 transition-colors hover:text-white">
                  {c.label}
                </Link>
                <span aria-hidden="true" className="mx-2">/</span>
              </span>
            ))}
            <span className="text-white/80">{eyebrow}</span>
          </nav>
        )}
        <Eyebrow tone="dark">{eyebrow}</Eyebrow>
        <h1 className="font-display mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.08]">{title}</h1>
        {lead && <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed text-white/65">{lead}</p>}
        {ctas && (
          <>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PilotCtaLink location="page-hero" />
              <BookCallLink location="page-hero" />
            </div>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-white/50">
              {PILOT_PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-accent-400" aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>
    </section>
  )
}
