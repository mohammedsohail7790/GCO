import { describe, it, expect } from 'vitest'
import { looksLikeSecret, CLIENT_PROFILE_FIELDS } from '@/lib/onboarding/service'

describe('client profile: credentials are refused', () => {
  it.each([
    'sk-live-51H8abcdefghijklmnop', 'whsec_abcdefgh12345678', 'xoxb-1234567890-abcdefghij', 'api_key: 12345', 'API KEY = abc', 'password: hunter2', 'secret=abc',
    'access token: abc', 'Bearer abc123', '-----BEGIN PRIVATE KEY-----', 'a'.repeat(40), '0123456789abcdef0123456789abcdef0123', 'dGhpcyBpcyBhIGZha2UgYmFzZTY0IHRva2VuIHZhbHVl',
  ])('refuses %s', (v) => expect(looksLikeSecret(v)).toBe(true))

  it.each([
    'In-app chat widget', 'client.example.com', 'https://client.example.com', 'Mon-Fri 09:00-18:00 CET', 'Jane Doe, jane@client.example.com', 'WhatsApp Business (client-owned number)',
    'Escalate to Marco Rossi +39 02 1234 5678', 'risk-assessment-framework owner', 'desk-support team', 'task-management tool', 'Bearer of the escalation (Jane)', 'English, Italian and Swedish', 'https://www.client-example-company.com/support',
  ])('accepts ordinary text: %s', (v) => expect(looksLikeSecret(v)).toBe(false))

  it('only the five documented non-secret fields exist, each with a short limit', () => {
    expect(Object.keys(CLIENT_PROFILE_FIELDS).sort()).toEqual(['channel', 'escalationContact', 'operatingHours', 'technicalContact', 'website'])
    for (const max of Object.values(CLIENT_PROFILE_FIELDS)) expect(max).toBeLessThanOrEqual(200)
  })
})

describe('shared guard: URLs are judged by their content, not their length', () => {
  it.each([
    'https://www.linkedin.com/in/some-very-long-profile-name-with-many-words-12345',
    'Profile: https://www.linkedin.com/company/an-extremely-long-company-name-that-goes-on-and-on/about',
    'Calendly: https://calendly.com/cristianidiaghe9/30min',
  ])('accepts %s', (v) => expect(looksLikeSecret(v)).toBe(false))
  it.each([
    'https://client.example.com/hook?token=abcdef123456', 'see https://x.example.com/a?api_key=AKIAIOSFODNN7EXAMPLE1', 'https://x.example.com/cb?password=hunter22secret',
    'refresh_token: 1//0gAbCdEfG', 'oauth refresh token=1//0gAbCdEfGhIjKl',
  ])('refuses %s', (v) => expect(looksLikeSecret(v)).toBe(true))
})
