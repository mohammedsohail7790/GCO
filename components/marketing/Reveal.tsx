'use client'

import { useEffect, useRef, useState } from 'react'

// Subtle on-scroll reveal (opacity + small translate only - no layout shift).
// Content is visible by default and in the server HTML: elements are only hidden
// after hydration, and only if they start below the fold, so there is no flash,
// no hidden content without JS, and nothing to wait for. Honors
// prefers-reduced-motion by never hiding anything.
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'visible' | 'hidden'>('visible')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return
    // Loaded in a background/hidden tab: observers may not fire, so never hide content.
    if (document.visibilityState !== 'visible') return
    if (el.getBoundingClientRect().top < window.innerHeight) return // already on screen

    setState('hidden')
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('visible')
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out ${
        state === 'hidden' ? 'translate-y-3 opacity-0' : 'translate-y-0 opacity-100'
      } ${className}`}
      style={{ transitionDelay: state === 'visible' && delay ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  )
}
