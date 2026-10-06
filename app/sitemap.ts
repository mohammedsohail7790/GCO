import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config/site'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'
import { publishedArticles } from '@/lib/content/resources'

// Only public, published pages. Drafts (published: false), authenticated areas, admin and test routes are never listed.
interface Entry {
  path: string
  priority: number
  lastModified?: Date
}

export function sitemapEntries(): Entry[] {
  const articles = publishedArticles()
  return [
    { path: '', priority: 1 },
    { path: '/pilot', priority: 0.9 },
    { path: '/services', priority: 0.8 },
    ...SERVICES.map((s) => ({ path: `/services/${s.slug}`, priority: 0.7 })),
    { path: '/industries', priority: 0.8 },
    ...INDUSTRIES.map((i) => ({ path: `/industries/${i.slug}`, priority: 0.7 })),
    { path: '/platform', priority: 0.8 },
    { path: '/how-it-works', priority: 0.7 },
    { path: '/resources', priority: 0.7 },
    ...articles.map((a) => ({ path: `/resources/${a.slug}`, priority: 0.6, lastModified: new Date(a.publishedAt + 'T00:00:00Z') })),
    { path: '/security', priority: 0.6 },
    { path: '/about', priority: 0.6 },
    { path: '/careers', priority: 0.5 },
    { path: '/contact', priority: 0.7 },
  ]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map((e) => ({
    url: `${SITE_URL}${e.path}`,
    lastModified: e.lastModified ?? new Date(),
    changeFrequency: 'monthly' as const,
    priority: e.priority,
  }))
}
