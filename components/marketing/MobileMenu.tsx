'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
  { href: '/careers', label: 'Careers' },
  { href: '/contact', label: 'Contact' },
]

export function MobileMenu() {
  const [open, setOpen] = useState(false)

  // Lock body scroll while the drawer is open - without this the page
  // behind it stays scrollable, a common drawer bug. Closing on navigation
  // happens directly in each Link's onClick below, not via a route-change
  // effect (which would call setState synchronously inside an effect body).
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Open menu"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-graphite"
      >
        <span className="relative block h-4 w-5">
          <span className="absolute left-0 top-0 h-[1.5px] w-5 bg-current" />
          <span className="absolute left-0 top-[7px] h-[1.5px] w-5 bg-current" />
          <span className="absolute left-0 top-[14px] h-[1.5px] w-5 bg-current" />
        </span>
      </button>

      {open &&
        createPortal(
          // Portaled to document.body rather than rendered in place: the
          // header this button lives in has `backdrop-blur-md`
          // (backdrop-filter), which - like `transform` or `filter` - creates
          // a new CSS containing block for any `position: fixed` descendant.
          // Without the portal, this overlay's `fixed inset-0` resolved
          // against the 72px-tall header box instead of the viewport,
          // clipping the entire drawer to a sliver at the top of the page
          // (confirmed visually in mobile QA before this fix). The portal
          // also means the header's own open-button is no longer inside this
          // overlay's stacking context, so a dedicated close button lives
          // here instead, positioned to align with where that button sits.
          <div
            id="mobile-menu"
            className="fixed inset-0 z-50 animate-fade-in bg-ink/98 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-6 top-[18px] flex h-9 w-9 items-center justify-center rounded-lg text-white"
            >
              <span className="relative block h-4 w-5">
                <span className="absolute left-0 top-[7px] h-[1.5px] w-5 rotate-45 bg-current" />
                <span className="absolute left-0 top-[7px] h-[1.5px] w-5 -rotate-45 bg-current" />
              </span>
            </button>
            <nav className="flex h-full flex-col justify-center gap-1 px-8">
              {NAV_LINKS.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="animate-fade-up border-b border-white/10 py-4 font-display text-2xl font-medium text-white/90 transition-colors hover:text-white"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/contact"
                onClick={() => setOpen(false)}
                className="animate-fade-up mt-6 w-fit rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white"
                style={{ animationDelay: `${NAV_LINKS.length * 0.05}s` }}
              >
                Book a Call
              </Link>
            </nav>
          </div>,
          document.body,
        )}
    </div>
  )
}
