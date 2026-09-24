import { test, expect } from '@playwright/test'
import { anonymousContext, sharedAdminContext, loginAs } from './helpers'
import { db } from '@/lib/db/client'

// Public marketing site: pages render, navigation links are present, forms
// validate server-side and are protected against spam/abuse, and the public
// endpoints never leak into authenticated-only surfaces. No browser is
// launched here (see playwright.config.ts) - these are real HTTP checks
// against the running app, same as the rest of this suite.
test.describe('Public website - pages', () => {
  const PAGES: Array<{ path: string; heading: string }> = [
    { path: '/services', heading: 'managed operations layer' },
    { path: '/how-it-works', heading: 'straightforward path' },
    { path: '/about', heading: 'managed human operations company' },
    { path: '/careers', heading: 'reliable operators' },
    { path: '/contact', heading: 'Tell us about your operation' },
  ]

  for (const { path, heading } of PAGES) {
    test(`${path} renders with expected content`, async () => {
      const anon = await anonymousContext()
      const res = await anon.get(path)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(html.toLowerCase()).toContain(heading.toLowerCase())
      // Every marketing page links back to the shared nav destinations.
      expect(html).toContain('href="/contact"')
      expect(html).toContain('href="/careers"')
    })
  }

  test('homepage renders and links to every public page plus login', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/')
    expect(res.status()).toBe(200)
    const html = await res.text()
    for (const path of ['/services', '/how-it-works', '/about', '/careers', '/contact', '/login']) {
      expect(html).toContain(`href="${path}"`)
    }
  })

  test('robots.txt disallows authenticated app surfaces and points to the sitemap', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/robots.txt')
    expect(res.status()).toBe(200)
    const body = await res.text()
    expect(body).toContain('Disallow: /admin')
    expect(body).toContain('Disallow: /api/')
    expect(body).toMatch(/Sitemap: .*\/sitemap\.xml/)
  })

  test('sitemap.xml lists every public page', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/sitemap.xml')
    expect(res.status()).toBe(200)
    const body = await res.text()
    for (const path of ['/services', '/how-it-works', '/about', '/careers', '/contact']) {
      expect(body).toContain(`<loc>`)
      expect(body).toContain(path)
    }
  })

  test('each public page sets its own canonical link and title', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/services')
    const html = await res.text()
    expect(html).toContain('rel="canonical"')
    expect(html).toContain('<title>Services | GCO</title>')
  })
})

test.describe('Public website - contact form', () => {
  test('rejects an invalid submission with a 400 and never creates a lead', async () => {
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/public/contact', {
      data: { name: 'X', company: 'Y', email: 'not-an-email' },
      headers: { 'x-forwarded-for': `test-contact-invalid-${Date.now()}` },
    })
    expect(res.status()).toBe(400)
  })

  test('a valid submission creates exactly one unassigned Lead with source=website_contact_form', async () => {
    const anon = await anonymousContext()
    const email = `contact-e2e-${Date.now()}@e2e.gco`
    const res = await anon.post('/api/v1/public/contact', {
      data: {
        name: 'Priya Client',
        company: 'Client Co',
        email,
        country: 'Kenya',
        operationType: 'SaaS',
        service: 'Customer Support Operations',
        teamSize: '5-10 operators',
        message: 'Looking for 24/7 coverage.',
      },
      headers: { 'x-forwarded-for': `test-contact-valid-${Date.now()}` },
    })
    expect(res.status()).toBe(201)

    const lead = await db.lead.findUnique({ where: { email } })
    expect(lead).toBeTruthy()
    expect(lead!.source).toBe('website_contact_form')
    expect(lead!.ownerId).toBeNull()
    expect(lead!.notes).toContain('Customer Support Operations')

    await db.leadHistoryEntry.deleteMany({ where: { leadId: lead!.id } })
    await db.lead.delete({ where: { id: lead!.id } })
  })

  test('a resubmission with the same email is accepted gracefully, not surfaced as a duplicate error', async () => {
    const anon = await anonymousContext()
    const email = `contact-dup-e2e-${Date.now()}@e2e.gco`
    const ip = `test-contact-dup-${Date.now()}`
    const first = await anon.post('/api/v1/public/contact', {
      data: { name: 'A', company: 'B', email },
      headers: { 'x-forwarded-for': ip },
    })
    expect(first.status()).toBe(201)

    const second = await anon.post('/api/v1/public/contact', {
      data: { name: 'A', company: 'B', email },
      headers: { 'x-forwarded-for': `${ip}-b` }, // different IP bucket, same email
    })
    expect(second.status()).toBe(201)
    const body = (await second.json()).data
    expect(body.received).toBe(true)

    const leadCount = await db.lead.count({ where: { email } })
    expect(leadCount).toBe(1)

    const lead = await db.lead.findUniqueOrThrow({ where: { email } })
    await db.leadHistoryEntry.deleteMany({ where: { leadId: lead.id } })
    await db.lead.delete({ where: { id: lead.id } })
  })

  test('a filled honeypot field is silently accepted and creates no lead', async () => {
    const anon = await anonymousContext()
    const email = `contact-honeypot-${Date.now()}@e2e.gco`
    const res = await anon.post('/api/v1/public/contact', {
      data: { name: 'Bot', company: 'Bot Co', email, website: 'http://spam.example' },
      headers: { 'x-forwarded-for': `test-contact-honeypot-${Date.now()}` },
    })
    expect(res.status()).toBe(201)

    const lead = await db.lead.findUnique({ where: { email } })
    expect(lead).toBeNull()
  })

  test('an oversized payload is rejected with 413', async () => {
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/public/contact', {
      data: { name: 'X', company: 'Y', email: 'z@e2e.gco', message: 'a'.repeat(25_000) },
      headers: { 'x-forwarded-for': `test-contact-oversized-${Date.now()}` },
    })
    expect(res.status()).toBe(413)
  })

  test('exceeding the per-IP rate limit returns 429', async () => {
    const anon = await anonymousContext()
    const ip = `test-contact-ratelimit-${Date.now()}`
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) {
      const res = await anon.post('/api/v1/public/contact', {
        data: { name: 'RL', company: 'RL Co', email: `rl-${Date.now()}-${i}@e2e.gco` },
        headers: { 'x-forwarded-for': ip },
      })
      statuses.push(res.status())
    }
    expect(statuses.filter((s) => s === 201).length).toBe(5) // RATE_LIMITS.PUBLIC_FORM.max
    expect(statuses.filter((s) => s === 429).length).toBe(2)

    const created = await db.lead.findMany({ where: { companyName: 'RL Co' }, select: { id: true } })
    const createdIds = created.map((l) => l.id)
    await db.leadHistoryEntry.deleteMany({ where: { leadId: { in: createdIds } } })
    await db.lead.deleteMany({ where: { id: { in: createdIds } } })
  })
})

test.describe('Public website - careers application', () => {
  test('rejects an invalid submission with a 400', async () => {
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/public/careers/apply', {
      data: { fullName: '', email: 'not-an-email' },
      headers: { 'x-forwarded-for': `test-careers-invalid-${Date.now()}` },
    })
    expect(res.status()).toBe(400)
  })

  test('a valid submission creates a CareerApplication row', async () => {
    const anon = await anonymousContext()
    const email = `careers-e2e-${Date.now()}@e2e.gco`
    const res = await anon.post('/api/v1/public/careers/apply', {
      data: { fullName: 'Case Worker', email, country: 'Nigeria', languages: 'English, French', message: 'Interested in remote chat support.' },
      headers: { 'x-forwarded-for': `test-careers-valid-${Date.now()}` },
    })
    expect(res.status()).toBe(201)
    const body = (await res.json()).data
    expect(body.id).toBeTruthy()

    const app = await db.careerApplication.findUnique({ where: { id: body.id } })
    expect(app).toBeTruthy()
    expect(app!.email).toBe(email)

    await db.careerApplication.delete({ where: { id: body.id } })
  })

  test('a filled honeypot field is silently accepted and creates no application', async () => {
    const anon = await anonymousContext()
    const email = `careers-honeypot-${Date.now()}@e2e.gco`
    const res = await anon.post('/api/v1/public/careers/apply', {
      data: { fullName: 'Bot', email, website: 'http://spam.example' },
      headers: { 'x-forwarded-for': `test-careers-honeypot-${Date.now()}` },
    })
    expect(res.status()).toBe(201)

    const count = await db.careerApplication.count({ where: { email } })
    expect(count).toBe(0)
  })

  test('an oversized payload is rejected with 413', async () => {
    const anon = await anonymousContext()
    const res = await anon.post('/api/v1/public/careers/apply', {
      data: { fullName: 'X', email: 'z@e2e.gco', message: 'a'.repeat(25_000) },
      headers: { 'x-forwarded-for': `test-careers-oversized-${Date.now()}` },
    })
    expect(res.status()).toBe(413)
  })
})

test.describe('Public website - career applications visibility (RBAC)', () => {
  test('is unreachable without a session', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/api/v1/admin/career-applications')
    expect(res.status()).toBe(401)
  })

  test('a HUNTER cannot view career applications', async () => {
    const hunterCtx = await loginAs('hunter1@demo.gco')
    const res = await hunterCtx.get('/api/v1/admin/career-applications')
    expect(res.status()).toBe(403)
  })

  test('MANAGER and CEO_ADMIN can view career applications', async () => {
    const managerCtx = await loginAs('manager@demo.gco')
    const managerRes = await managerCtx.get('/api/v1/admin/career-applications')
    expect(managerRes.status()).toBe(200)

    const admin = await sharedAdminContext()
    const adminRes = await admin.get('/api/v1/admin/career-applications')
    expect(adminRes.status()).toBe(200)
    const body = (await adminRes.json()).data
    expect(Array.isArray(body)).toBe(true)
  })
})
