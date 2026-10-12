import { test, expect } from '@playwright/test'
import { anonymousContext, sharedAdminContext } from './helpers'

// Everywhere that is NOT staging (production, CI, local), the staging tools do not exist - not even for the owner.
test.skip(process.env.E2E_STAGING === '1', 'runs against non-staging stacks only')

test('staging tools return 404 outside staging, for the owner and for anonymous callers, and the health check says production', async () => {
  const owner = await sharedAdminContext()
  const anon = await anonymousContext()
  for (const ctx of [owner, anon]) {
    expect((await ctx.get('/api/v1/staging/clients')).status()).toBe(404)
    expect((await ctx.get('/api/v1/staging/outbox?tenantId=x')).status()).toBe(404)
    expect((await ctx.post('/api/v1/staging/simulate', { data: { tenantId: 'x', customer: 'a', text: 'b' } })).status()).toBe(404)
  }
  expect((await (await anon.get('/api/v1/health')).json()).data.environment).toBe('production')
  const robots = await (await anon.get('/robots.txt')).text()
  expect(robots).toContain('Allow: /')
  expect(await (await anon.get('/login')).text()).not.toContain('STAGING:')
})
