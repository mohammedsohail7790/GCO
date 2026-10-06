import { describe, it, expect } from 'vitest'
import { organizationJsonLd, websiteJsonLd, breadcrumbJsonLd, articleJsonLd, serializeJsonLd } from '@/lib/seo/jsonld'
import { pageMetadata, SITE_URL } from '@/lib/config/site'
import { sitemapEntries } from '@/app/sitemap'
import robots from '@/app/robots'
import { ARTICLES } from '@/lib/content/resources'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'

describe('JSON-LD (verified information only)', () => {
  it('Organization uses the verified name/email and fabricates nothing', () => {
    const o = organizationJsonLd() as any
    expect(o['@type']).toBe('Organization')
    expect(o.name).toBe('Global Conversation Operations')
    expect(o.email).toBe('founder@globalconversationoperations.com')
    expect(o.url).toBe(SITE_URL)
    const keys = Object.keys(o).join(' ')
    for (const forbidden of ['sameAs', 'aggregateRating', 'review', 'address', 'telephone', 'numberOfEmployees', 'award', 'founder', 'priceRange', 'logo']) expect(keys).not.toContain(forbidden)
    expect([...new Set(JSON.stringify(o).match(/[\w.+-]+@[\w.-]+\.[a-z]+/gi))]).toEqual(['founder@globalconversationoperations.com'])
  })

  it('WebSite references the Organization as publisher', () => {
    const w = websiteJsonLd() as any
    expect(w['@type']).toBe('WebSite')
    expect(w.publisher['@id']).toBe((organizationJsonLd() as any)['@id'])
  })

  it('BreadcrumbList has ordered, absolute items', () => {
    const b = breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }, { name: 'X', path: '/resources/x' }]) as any
    expect(b['@type']).toBe('BreadcrumbList')
    expect(b.itemListElement.map((i: any) => i.position)).toEqual([1, 2, 3])
    for (const i of b.itemListElement) expect(i.item).toMatch(new RegExp('^' + SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  it('Article carries the article fields and no ratings/prices', () => {
    const a = articleJsonLd({ title: 'T', description: 'D', path: '/resources/t', publishedAt: '2026-10-06', section: 'Chat Operations' }) as any
    expect(a['@type']).toBe('Article')
    expect(a.datePublished).toBe('2026-10-06')
    expect(a.url).toBe(`${SITE_URL}/resources/t`)
    expect(JSON.stringify(a)).not.toMatch(/aggregateRating|review|offers|price/)
  })

  it('serialisation is valid JSON and cannot close the script tag', () => {
    const s = serializeJsonLd(articleJsonLd({ title: '</script><script>alert(1)</script>', description: 'x', path: '/p', publishedAt: '2026-10-06', section: 's' }))
    expect(s).not.toContain('</script>')
    expect(() => JSON.parse(s)).not.toThrow()
    expect(JSON.parse(s).headline).toBe('</script><script>alert(1)</script>')
  })
})

describe('page metadata', () => {
  it('sets canonical, Open Graph image and a large Twitter card on every page', () => {
    const m: any = pageMetadata({ title: 'Services', description: 'd', path: '/services' })
    expect(m.alternates.canonical).toBe(`${SITE_URL}/services`)
    expect(m.openGraph.images[0].url).toBe(`${SITE_URL}/opengraph-image`)
    expect(m.twitter.card).toBe('summary_large_image')
    expect(m.openGraph.type).toBe('website')
  })
  it('articles use type=article with a published time', () => {
    const m: any = pageMetadata({ title: 'T', description: 'd', path: '/resources/t', type: 'article', article: { publishedTime: '2026-10-06' } })
    expect(m.openGraph.type).toBe('article')
    expect(m.openGraph.publishedTime).toBe('2026-10-06')
  })
})

describe('sitemap and robots', () => {
  const paths = sitemapEntries().map((e) => e.path)
  it('lists resources, every published article and security', () => {
    expect(paths).toEqual(expect.arrayContaining(['/resources', '/security', '/platform', '/pilot']))
    for (const a of ARTICLES.filter((x) => x.published)) expect(paths).toContain(`/resources/${a.slug}`)
    for (const s of SERVICES) expect(paths).toContain(`/services/${s.slug}`)
    for (const i of INDUSTRIES) expect(paths).toContain(`/industries/${i.slug}`)
  })
  it('has no duplicates, no drafts and no private/internal routes', () => {
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of paths) expect(p).not.toMatch(/^\/(admin|manager|operator|client-panel|hunter|home|api|login)/)
    ARTICLES.push({ ...ARTICLES[0]!, slug: 'a-draft', published: false })
    try {
      expect(sitemapEntries().map((e) => e.path)).not.toContain('/resources/a-draft')
    } finally {
      ARTICLES.pop()
    }
  })
  it('robots does not block public content and still blocks private areas', () => {
    const r: any = robots()
    const disallow: string[] = r.rules[0].disallow
    for (const p of ['/resources', '/security', '/platform', '/services', '/industries', '/pilot']) expect(disallow.some((d) => p.startsWith(d))).toBe(false)
    for (const p of ['/admin', '/manager', '/operator', '/client-panel', '/hunter', '/home', '/api/']) expect(disallow).toContain(p)
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })
})

describe('homepage title', () => {
  it('renders an explicit absolute title (a bare undefined title renders no <title> tag)', () => {
    const m: any = pageMetadata({ title: 'Managed Conversation Operations', description: 'd', path: '/' })
    expect(m.title).toEqual({ absolute: expect.stringMatching(/^GCO - .+/) })
  })
  it('inner pages pass a plain string for the layout template', () => {
    expect((pageMetadata({ title: 'Services', description: 'd', path: '/services' }) as any).title).toBe('Services')
  })
})
