'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { PILOT_PATH, type NavItem } from '@/lib/content/site'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function MobileMenu({
  navItems,
  pilotLabel,
  bookCall,
  bookCallLabel,
}: {
  navItems: NavItem[]
  pilotLabel: string
  bookCall: { href: string; external: boolean }
  bookCallLabel: string
}) {
  const [open, setOpen] = useState(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    // Return focus to the control that opened the menu.
    openButtonRef.current?.focus()
  }, [])

  // Scroll lock while open, applied as a CSS class scoped to below lg: if the
  // viewport grows past the breakpoint (rotation/resize) the lock releases by
  // itself - no JS event required. Closing on navigation happens in each Link's
  // onClick (no route-change effect, which would setState inside an effect).
  useEffect(() => {
    document.documentElement.classList.toggle('max-lg:overflow-hidden', open)
    return () => document.documentElement.classList.remove('max-lg:overflow-hidden')
  }, [open])

  // Move focus into the dialog on open; Escape closes; Tab is trapped inside.
  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  // The open button is hidden from lg up; make sure the overlay never outlives it
  // (e.g. rotating a tablet or resizing a window while the menu is open).
  useEffect(() => {
    if (!open) return
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [open])

  const linkClass =
    'flex min-h-12 items-center border-b border-white/10 py-3 font-display text-xl font-medium text-white/90 transition-colors hover:text-white'

  return (
    <div className="lg:hidden">
      <button
        ref={openButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="mobile-menu"
        aria-label="Open menu"
        className="relative -mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-graphite"
      >
        <span className="relative block h-4 w-5" aria-hidden="true">
          <span className="absolute left-0 top-0 h-[1.5px] w-5 bg-current" />
          <span className="absolute left-0 top-[7px] h-[1.5px] w-5 bg-current" />
          <span className="absolute left-0 top-[14px] h-[1.5px] w-5 bg-current" />
        </span>
      </button>

      {open &&
        createPortal(
          // Portaled to document.body: the header has `backdrop-blur` (a
          // backdrop-filter), which makes it the containing block for any
          // `position: fixed` descendant and would clip this overlay to the
          // header's own box. `bg-ink/95` is a valid Tailwind opacity step
          // (the previous `/98` is not generated, which left the overlay with no
          // background at all).
          <div
            ref={dialogRef}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="fixed inset-0 z-50 animate-fade-in overflow-y-auto bg-ink/95 backdrop-blur-md lg:hidden"
          >
            {/* Same height/gutter as the header so the close button lands exactly where the open button was. */}
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-end px-4">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-white"
              >
                <span className="relative block h-4 w-5" aria-hidden="true">
                  <span className="absolute left-0 top-[7px] h-[1.5px] w-5 rotate-45 bg-current" />
                  <span className="absolute left-0 top-[7px] h-[1.5px] w-5 -rotate-45 bg-current" />
                </span>
              </button>
            </div>

            <nav aria-label="Mobile" className="flex flex-col px-6 pb-10 pt-2">
              {navItems.map((link, i) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`${linkClass} animate-fade-up`}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  {link.label}
                </Link>
              ))}
              <Link href="/login" onClick={() => setOpen(false)} className={`${linkClass} text-white/60`}>
                Client Login
              </Link>

              <div className="mt-8 flex flex-col gap-3">
                <Link
                  href={PILOT_PATH}
                  onClick={() => setOpen(false)}
                  data-cta="pilot"
                  data-cta-location="mobile-menu"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent-500 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-accent-600"
                >
                  {pilotLabel}
                </Link>
                {bookCall.external ? (
                  <a
                    href={bookCall.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    data-cta="book-call"
                    data-cta-location="mobile-menu"
                    className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/5"
                  >
                    {bookCallLabel}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <Link
                    href={bookCall.href}
                    onClick={() => setOpen(false)}
                    data-cta="book-call"
                    data-cta-location="mobile-menu"
                    className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/20 px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-white/5"
                  >
                    {bookCallLabel}
                  </Link>
                )}
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </div>
  )
}
