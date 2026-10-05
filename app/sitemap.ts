import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config/site'

import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'

const PUBLIC_PAGES = [
  '',
  '/pilot',
  '/services',
  ...SERVICES.map((s) => `/services/${s.slug}`),
  '/industries',
  ...INDUSTRIES.map((i) => `/industries/${i.slug}`),
  '/platform',
  '/how-it-works',
  '/about',
  '/careers',
  '/contact',
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.7,
  }))
}
