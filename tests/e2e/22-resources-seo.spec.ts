import { test, expect } from '@playwright/test'
import { anonymousContext } from './helpers'
import { publishedArticles } from '@/lib/content/resources'

// Resources, SEO metadata, structured data and the security page - real HTTP checks.
const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1]!) as Record<string, unknown>].flat())

test.describe('Resources + SEO', () => {
  test('index lists all published articles', async () => {
    const html = await (await (await anonymousContext()).get('/resources')).text()
    for (const a of publishedArticles()) expect(html).toContain(`href="/resources/${a.slug}"`)
  })

  for (const a of publishedArticles()) {
    test(`/resources/${a.slug}: article page, canonical, OG, Article + Breadcrumb JSON-LD`, async () => {
      const res = await (await anonymousContext()).get(`/resources/${a.slug}`)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html).toContain(a.title.replace(/&/g, '&amp;'))
      expect(html.match(/rel="canonical"/g)?.length).toBe(1)
      expect(html).toContain(`/resources/${a.slug}"`)
      expect(html).toMatch(/property="og:image"/)
      expect(html).toMatch(/name="twitter:card" content="summary_large_image"/)
      const types = jsonLd(html).map((j) => j['@type'])
      expect(types).toContain('Article')
      expect(types).toContain('BreadcrumbList')
      expect(html).toContain('data-cta="resource"')
      expect(html).toContain('href="/pilot"')
    })
  }

  test('unknown article slug is a 404', async () => {
    expect((await (await anonymousContext()).get('/resources/does-not-exist')).status()).toBe(404)
  })

  test('homepage emits Organization + WebSite and no Article; non-article pages have no Article', async () => {
    const anon = await anonymousContext()
    const home = jsonLd(await (await anon.get('/')).text()).map((j) => j['@type'])
    expect(home).toEqual(expect.arrayContaining(['Organization', 'WebSite']))
    expect(home).not.toContain('Article')
    for (const p of ['/services', '/platform', '/security', '/resources']) expect(jsonLd(await (await anon.get(p)).text()).map((j) => j['@type'])).not.toContain('Article')
  })

  test('sitemap lists resources, articles and security; robots does not block them', async () => {
    const anon = await anonymousContext()
    const sm = await (await anon.get('/sitemap.xml')).text()
    expect(sm).toContain('/resources</loc>')
    expect(sm).toContain('/security</loc>')
    for (const a of publishedArticles()) expect(sm).toContain(`/resources/${a.slug}</loc>`)
    const robots = await (await anon.get('/robots.txt')).text()
    expect(robots).not.toMatch(/Disallow: \/(resources|security)/)
  })

  test('favicon and app icons are served', async () => {
    const anon = await anonymousContext()
    for (const p of ['/favicon.ico', '/icon.svg', '/apple-icon.png']) expect((await anon.get(p)).status(), p).toBe(200)
  })

  test('security page: verified controls, onboarding sentence, no certification claims', async () => {
    const html = await (await (await anonymousContext()).get('/security')).text()
    expect(html).toContain('Additional security and data-handling requirements can be reviewed during onboarding.')
    expect(html).not.toMatch(/SOC ?2|ISO ?27001|HIPAA|PCI|penetration test|encrypted at rest/i)
  })
})
