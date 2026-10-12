import { test, expect } from '@playwright/test'
import { anonymousContext } from './helpers'

// The public "Inside GCO" tour: the page, its five screenshots, the video, poster and captions are all served to anonymous visitors.
test.describe('Inside GCO page', () => {
  test('renders for an anonymous visitor with every section, the demo-data notice and working media', async () => {
    const anon = await anonymousContext()
    const res = await anon.get('/inside-gco')
    expect(res.status()).toBe(200)
    const html = await res.text()
    for (const h of ['Our technology in action', 'Operator dashboard', 'Live chat and queue management', 'Supervisor dashboard', 'Quality control', 'Multilingual operations', 'The complete workflow']) expect(html).toContain(h)
    expect(html).toContain('fictional')
    expect(html).toContain('<video')
    expect(html).toMatch(/<track[^>]+kind="captions"/)
    expect(html).not.toMatch(/\.demo\.gco|Mock provider/)

    for (const f of ['operator', 'queue', 'supervisor', 'quality', 'languages']) {
      const img = await anon.get(`/inside-gco/${f}.webp`)
      expect(img.status(), f).toBe(200)
      expect(img.headers()['content-type']).toContain('image/webp')
    }
    const poster = await anon.get('/inside-gco/poster.webp'); expect(poster.status()).toBe(200)
    const vtt = await anon.get('/inside-gco/captions.vtt'); expect(vtt.status()).toBe(200); expect((await vtt.text()).startsWith('WEBVTT')).toBe(true)
    const vid = await anon.get('/inside-gco/inside-gco.mp4', { headers: { Range: 'bytes=0-1023' } })
    expect([200, 206]).toContain(vid.status())
    expect(vid.headers()['content-type']).toContain('video/mp4')
  })

  test('is reachable from the platform page', async () => {
    const anon = await anonymousContext()
    expect(await (await anon.get('/platform')).text()).toContain('href="/inside-gco"')
  })
})
