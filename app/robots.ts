import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/config/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated app surfaces - nothing here is useful to a crawler,
        // and none of it is reachable without a session anyway (see
        // middleware.ts), but keep crawlers out of it explicitly too.
        disallow: ['/admin', '/manager', '/operator', '/client-panel', '/hunter', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
