import { SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/config/site'
import { PUBLIC_EMAIL } from '@/lib/content/site'

// Structured data (schema.org JSON-LD). Verified GCO information ONLY: no ratings, reviews, prices, awards,
// organisation size, social profiles, addresses or phone numbers are emitted because none are verified.
// Emit each type only where it is appropriate (Organization/WebSite on the homepage, Article on articles,
// BreadcrumbList on pages that render a breadcrumb).

type Json = Record<string, unknown>

export const ORG_ID = `${SITE_URL}/#organization`

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Global Conversation Operations',
    alternateName: SITE_NAME,
    url: SITE_URL,
    description: 'Human conversation operations: trained operators, supervised and supported by an operations platform and AI-assisted workflows.',
    email: PUBLIC_EMAIL,
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: PUBLIC_EMAIL, availableLanguage: ['English'] }],
  }
}

export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    url: SITE_URL,
    name: 'Global Conversation Operations',
    description: SITE_TAGLINE,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  }
}

export interface Crumb {
  name: string
  path: string
}

export function breadcrumbJsonLd(crumbs: Crumb[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${SITE_URL}${c.path}` })),
  }
}

export function articleJsonLd(a: { title: string; description: string; path: string; publishedAt: string; modifiedAt?: string; section: string }): Json {
  const url = `${SITE_URL}${a.path}`
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: a.title,
    description: a.description,
    datePublished: a.publishedAt,
    dateModified: a.modifiedAt ?? a.publishedAt,
    articleSection: a.section,
    inLanguage: 'en',
    url,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    image: `${SITE_URL}/opengraph-image`,
  }
}

/** JSON-LD is embedded in a <script>; escape "<" so content can never close the tag. */
export function serializeJsonLd(data: Json | Json[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
