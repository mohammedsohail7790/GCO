import Link from 'next/link'
import { MobileMenu } from './MobileMenu'
import { GCOLockup } from './GCOLogo'
import { getCalendarProvider } from '@/lib/integrations/calendar/provider'

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
]

export function SiteHeader() {
  // Same fallback logic as the homepage's own "Book a Call" CTA (see
  // app/page.tsx) - previously this header always linked to /contact
  // regardless of whether Calendly was configured, silently mislabeling a
  // plain contact link as "Book a Call". One consistent primary CTA now
  // behaves identically everywhere it appears (per the Phase 14 conversion-
  // path requirement).
  const bookingUrl = getCalendarProvider().getBookingUrl()

  return (
    <header className="sticky top-0 z-40 border-b border-paper-border bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="GCO home">
          <GCOLockup size="md" />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13.5px] font-medium text-graphite-secondary transition-colors hover:text-graphite"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="hidden text-[13.5px] font-medium text-graphite-secondary transition-colors hover:text-graphite sm:block"
          >
            Client Login
          </Link>
          {bookingUrl ? (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-ink-700 md:block"
            >
              Book a Call
            </a>
          ) : (
            <Link
              href="/contact"
              className="hidden rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-ink-700 md:block"
            >
              Book a Call
            </Link>
          )}
          <MobileMenu bookingUrl={bookingUrl} />
        </div>
      </div>
    </header>
  )
}
