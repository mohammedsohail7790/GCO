import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config/site'

const PUBLIC_PAGES = ['', '/services', '/how-it-works', '/about', '/careers', '/contact']

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: path === '' ? 1 : 0.7,
  }))
}
