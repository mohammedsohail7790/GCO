'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { CTA_EVENT_BY_KIND, trackEvent, type AnalyticsEventName } from '@/lib/analytics/events'

// One tiny client component for the whole site: page_view on route changes, and ONE delegated click listener
// that turns [data-cta] links (already rendered by the server components) into CTA events. It reads only the
// CTA kind and location attributes - never link text, URLs or anything the visitor typed.
export function AnalyticsRoot() {
  const pathname = usePathname()

  useEffect(() => {
    trackEvent('page_view', { path: pathname })
  }, [pathname])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest?.('[data-cta]') as HTMLElement | null
      if (!el) return
      const event = CTA_EVENT_BY_KIND[el.dataset.cta ?? '']
      if (event) trackEvent(event as AnalyticsEventName, { location: el.dataset.ctaLocation, path: window.location.pathname })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
