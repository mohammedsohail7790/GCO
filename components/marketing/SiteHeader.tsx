import Link from 'next/link'

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/contact', label: 'Contact' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500">
            <span className="text-sm font-bold text-white">G</span>
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900">GCO</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="hidden text-sm font-medium text-slate-600 hover:text-slate-900 sm:block">
            Sign in
          </Link>
          <Link
            href="/contact"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            Book a Call
          </Link>
        </div>
      </div>

      {/* Mobile nav - simple wrapped links, no JS menu toggle needed for this size of nav. */}
      <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-6 py-2 md:hidden">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-xs font-medium text-slate-600 hover:text-slate-900">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}
