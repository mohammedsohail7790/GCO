import { describe, it, expect } from 'vitest'
import { ARTICLES, publishedArticles, getArticle, readingMinutes, articleWordCount, articlesForService, articlesForIndustry, relatedArticles, RESOURCE_CATEGORIES } from '@/lib/content/resources'
import { SERVICES } from '@/lib/content/services'
import { INDUSTRIES } from '@/lib/content/industries'

const ROUTES = new Set(['/platform', '/pilot', '/security', '/resources', '/how-it-works', '/contact', '/about', '/services', '/industries'])
const linksIn = (text: string) => [...text.matchAll(/\[[^\]]+\]\((\/[^)\s]*)\)/g)].map((m) => m[1]!)
const textOf = (a: (typeof ARTICLES)[number]) => a.body.map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text)).join(' ')

describe('resources: the five foundational articles', () => {
  it('publishes exactly the five approved articles', () => {
    expect(publishedArticles().map((a) => a.title).sort()).toEqual(
      [
        'How to Scale Chat Operations Without Losing Human Quality',
        'Human Moderation vs. Automated Moderation: Where Each Works Best',
        '24/7 Chat Coverage: What Businesses Actually Need to Operate Around the Clock',
        'How a Human + AI Conversation Operations Model Works',
        'When Should a Company Outsource Chat Support or Moderation?',
      ].sort(),
    )
  })

  it('every article has unique, well-formed metadata and stable slugs', () => {
    const slugs = ARTICLES.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(new Set(ARTICLES.map((a) => a.title)).size).toBe(ARTICLES.length)
    expect(new Set(ARTICLES.map((a) => a.description)).size).toBe(ARTICLES.length)
    for (const a of ARTICLES) {
      expect(a.slug, a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(a.description.length, a.slug).toBeGreaterThan(80)
      expect(a.description.length, a.slug).toBeLessThanOrEqual(175)
      expect(a.publishedAt, a.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect((RESOURCE_CATEGORIES as readonly string[]).includes(a.category), a.slug).toBe(true)
      expect(readingMinutes(a), a.slug).toBeGreaterThanOrEqual(1)
      expect(articleWordCount(a), a.slug).toBeGreaterThan(380)
    }
  })

  it('relates every article to real services and industries, and all inline links resolve to real routes', () => {
    for (const a of ARTICLES) {
      expect(a.services.length, a.slug).toBeGreaterThan(0)
      expect(a.industries.length, a.slug).toBeGreaterThan(0)
      for (const s of a.services) expect(SERVICES.some((x) => x.slug === s), `${a.slug} service ${s}`).toBe(true)
      for (const i of a.industries) expect(INDUSTRIES.some((x) => x.slug === i), `${a.slug} industry ${i}`).toBe(true)
      for (const l of linksIn(textOf(a))) {
        const ok = ROUTES.has(l) || (l.startsWith('/services/') && SERVICES.some((s) => `/services/${s.slug}` === l)) || (l.startsWith('/industries/') && INDUSTRIES.some((i) => `/industries/${i.slug}` === l)) || (l.startsWith('/resources/') && ARTICLES.some((x) => `/resources/${x.slug}` === l))
        expect(ok, `${a.slug} links to ${l}`).toBe(true)
      }
    }
  })

  it('every article links naturally to the platform, a service/industry, and carries a pilot CTA', () => {
    for (const a of ARTICLES) {
      const links = linksIn(textOf(a))
      expect(links.some((l) => l === '/platform' || l === '/security' || l === '/how-it-works' || l.startsWith('/services/') || l.startsWith('/industries/')), a.slug).toBe(true)
      expect(a.cta.primary, a.slug).toMatch(/Pilot/)
    }
    expect(getArticle('when-should-a-company-outsource-chat-support-or-moderation')!.cta.primary).toBe('Start Your Free 7-Day Pilot')
    expect(getArticle('human-moderation-vs-automated-moderation')!.cta.secondary).toBe('contact')
  })

  it('required qualifiers are present: 24/7 subject to staffing; human operator responsible; nothing sent automatically', () => {
    expect(textOf(getArticle('what-it-takes-to-run-chat-coverage-24-7')!)).toMatch(/24\/7 coverage is available subject to project staffing requirements\./)
    const hai = textOf(getArticle('how-a-human-ai-conversation-operations-model-works')!)
    expect(hai).toMatch(/human operator remains responsible for the final response/)
    expect(hai).toMatch(/Nothing is sent automatically by AI/)
    expect(textOf(getArticle('human-moderation-vs-automated-moderation')!)).toMatch(/does not take the decision away from a human/)
  })

  it('contains no invented proof or unapproved claims', () => {
    const all = ARTICLES.map(textOf).join(' ') + ARTICLES.map((a) => a.title + a.description).join(' ')
    for (const [re, label] of [
      [/\b\d+(\.\d+)?\s?%/, 'percentages'],
      [/\b\d{2,}\+/, 'N+ claims'],
      [/\b\d+ (operators|agents|languages|clients|customers|countries)\b/i, 'counts'],
      [/according to (a |the )?(study|report|survey|research)|studies show|research shows|statistics/i, 'research/statistics claims'],
      [/guarantee|certified|certification|\bISO\b|SOC ?2|GDPR/i, 'guarantees / certifications'],
      [/testimonial|case stud|trusted by|our clients include|customers like/i, 'social proof'],
      [/\b(voice|call[- ]cent(er|re)|phone support)\b/i, 'voice / call centre'],
      [/autonomous|replaces? (human|operators)|fully automated/i, 'autonomous AI'],
      [/in today'?s fast-paced|ever-evolving|game-chang|revolution|cutting-edge|world-class|best-in-class|leading/i, 'filler / hype'],
      [/within \d+ (minutes|seconds|hours)|sub-?\d+/i, 'response-time promises'],
    ] as const) {
      expect(all, label).not.toMatch(re)
    }
  })

  it('drafts are never published, listed, related or sitemapped', () => {
    const draft = { ...ARTICLES[0]!, slug: 'draft-article', title: 'Draft', published: false }
    ARTICLES.push(draft)
    try {
      expect(publishedArticles().some((a) => a.slug === 'draft-article')).toBe(false)
      expect(getArticle('draft-article')).toBeUndefined()
      expect(articlesForService(draft.services[0]!).some((a) => a.slug === 'draft-article')).toBe(false)
      expect(articlesForIndustry(draft.industries[0]!).some((a) => a.slug === 'draft-article')).toBe(false)
      expect(relatedArticles(ARTICLES[1]!, 10).some((a) => a.slug === 'draft-article')).toBe(false)
    } finally {
      ARTICLES.pop()
    }
  })
})
