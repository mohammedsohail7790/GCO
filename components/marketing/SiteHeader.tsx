import Link from 'next/link'
import { MobileMenu } from './MobileMenu'

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-paper-border bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink">
            <span className="font-display text-[13px] font-bold text-paper">G</span>
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight text-graphite">
            GCO
          </span>
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
          <Link
            href="/contact"
            className="hidden rounded-lg bg-ink px-5 py-2.5 text-[13.5px] font-semibold text-paper transition-colors hover:bg-ink-700 md:block"
          >
            Book a Call
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  )
}
