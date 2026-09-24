// Public website config - absolute base URL for canonical links, Open Graph
// tags, robots.txt, and sitemap.xml. See .env.example for NEXT_PUBLIC_SITE_URL.
// `||` (not `??`) deliberately - an empty string must fall back too, not
// just undefined/null. Confirmed necessary by a real production build
// failure: when this var is unset for a given build (e.g. a docker-compose
// service whose `build.args` doesn't happen to declare it), Docker's
// `ENV KEY=${ARG}` sets it to a literal empty string rather than leaving it
// absent, which `??` alone doesn't catch - `new URL('')` below then throws
// ERR_INVALID_URL and fails the entire build.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')

export const SITE_NAME = 'GCO'
export const SITE_TAGLINE = 'Managed conversation operations for growing businesses'

import type { Metadata } from 'next'

/** Shared per-page metadata: title, description, canonical URL, Open Graph. */
export function pageMetadata(opts: { title: string; description: string; path: string }): Metadata {
  const url = `${SITE_URL}${opts.path}`
  const title = opts.path === '/' ? `${SITE_NAME} - ${SITE_TAGLINE}` : `${opts.title} | ${SITE_NAME}`
  return {
    // The homepage uses the root layout's own default title verbatim (no
    // template applied to a bare `undefined`); every other page passes a
    // plain string, which the root layout's `%s | GCO` template wraps.
    title: opts.path === '/' ? undefined : opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description: opts.description,
    },
  }
}
