import Link from 'next/link'
import { MobileMenu } from './MobileMenu'
import { GCOLockup } from './GCOLogo'
import { PilotCtaLink } from './CtaLinks'
import { getBookCallTarget } from '@/lib/config/scheduling'
import { CTA, getNavItems } from '@/lib/content/site'

export function SiteHeader() {
  const navItems = getNavItems()
  const bookCall = getBookCallTarget()

  return (
    <header className="sticky top-0 z-40 border-b border-paper-border bg-paper/90 backdrop-blur-md">
      {/* Compact on mobile (56px), roomier from md up. */}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:h-[68px]">
        <Link href="/" aria-label="GCO home" className="flex items-center">
          <GCOLockup size="md" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {navItems.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13.5px] font-medium text-graphite-secondary transition-colors hover:text-graphite"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden text-[13.5px] font-medium text-graphite-secondary transition-colors hover:text-graphite lg:block"
          >
            Client Login
          </Link>
          <PilotCtaLink
            variant="ink"
            label={CTA.pilotShort}
            location="header"
            className="hidden !min-h-10 !px-5 !py-2.5 text-[13.5px] md:inline-flex"
          />
          <MobileMenu navItems={navItems} pilotLabel={CTA.pilotShort} bookCall={bookCall} bookCallLabel={CTA.bookCall} />
        </div>
      </div>
    </header>
  )
}
