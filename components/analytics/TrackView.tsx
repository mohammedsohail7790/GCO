'use client'

import { useEffect } from 'react'
import { trackEvent, type AnalyticsEventName } from '@/lib/analytics/events'

/** Fires a content-view event (service_view, industry_view, platform_view, resource_view) once on mount. */
export function TrackView({ event, slug, category }: { event: AnalyticsEventName; slug?: string; category?: string }) {
  useEffect(() => {
    trackEvent(event, { slug, category })
  }, [event, slug, category])
  return null
}
