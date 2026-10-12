import { describe, it, expect } from 'vitest'
import { assertStagingSeedAllowed, checkPersonaPassword, StagingSeedError, personaEmail } from '@/lib/staging/seed'
import { STAGING_CLIENTS } from '@/lib/staging/clients'
import { isStaging, stagingToolsEnabled, environmentName } from '@/lib/config/environment'
import { normalizeLanguage } from '@/lib/languages'
import { can } from '@/lib/auth/rbac'

describe('staging environment flags', () => {
  it('production is the default; staging needs the explicit flag, and the tools also need dev adapters', () => {
    const save = { ...process.env }
    delete process.env.GCO_ENVIRONMENT; delete process.env.ALLOW_DEV_ADAPTERS
    expect([isStaging(), stagingToolsEnabled(), environmentName()]).toEqual([false, false, 'production'])
    process.env.GCO_ENVIRONMENT = 'staging'
    expect([isStaging(), stagingToolsEnabled()]).toEqual([true, false])
    process.env.ALLOW_DEV_ADAPTERS = 'true'
    expect(stagingToolsEnabled()).toBe(true)
    process.env.GCO_ENVIRONMENT = 'Staging '; expect(isStaging()).toBe(false) // exact match only
    process.env = save
  })
  it('the staging tools are owner-only', () => {
    expect(can('CEO_ADMIN', 'STAGING_TOOLS')).toBe(true)
    for (const r of ['ASSISTANT', 'MANAGER', 'OPERATOR', 'CLIENT', 'HUNTER']) expect(can(r as 'MANAGER', 'STAGING_TOOLS')).toBe(false)
  })
})

describe('staging seed guards', () => {
  it('refuses unless GCO_ENVIRONMENT is staging', () => {
    expect(() => assertStagingSeedAllowed({})).toThrow(StagingSeedError)
    expect(() => assertStagingSeedAllowed({ GCO_ENVIRONMENT: 'production' })).toThrow(/never production/)
    expect(() => assertStagingSeedAllowed({ GCO_ENVIRONMENT: 'staging' })).not.toThrow()
  })
  it('the persona password comes from the runner, must satisfy the staff policy, and is not in the repository', () => {
    expect(() => checkPersonaPassword(undefined)).toThrow(/STAGING_PERSONA_PASSWORD/)
    expect(() => checkPersonaPassword('short')).toThrow(/rejected/)
    expect(() => checkPersonaPassword('DemoPassword123!')).toThrow(/rejected/) // the published seed password is refused
    expect(checkPersonaPassword('Orchard-Lantern-Quartz-2026')).toBe('Orchard-Lantern-Quartz-2026')
  })
})

describe('staging clients definition', () => {
  it('three different clients with separate teams; every language code is valid; all six GCO languages are staffed somewhere', () => {
    expect(STAGING_CLIENTS).toHaveLength(3)
    expect(new Set(STAGING_CLIENTS.map((c) => c.slug)).size).toBe(3)
    const staffed = new Set<string>()
    for (const c of STAGING_CLIENTS) {
      expect(c.slug).toMatch(/^staging-/)
      expect(c.operators.length).toBeGreaterThanOrEqual(3)
      expect(c.operators.some((o) => o.online)).toBe(true)
      for (const o of c.operators) for (const l of o.languages) { expect(normalizeLanguage(l)).toBe(l); staffed.add(l) }
      for (const s of c.samples) expect(normalizeLanguage(s.lang)).toBe(s.lang)
    }
    for (const l of ['en', 'it', 'fr', 'de', 'es', 'sv']) expect(staffed.has(l), l).toBe(true)
    expect(new Set(STAGING_CLIENTS.map((c) => c.sla)).size).toBeGreaterThan(1) // genuinely different configuration
  })
  it('persona emails are on the non-routable staging domain', () => {
    expect(personaEmail('operator', 'aurora', 2)).toBe('operator2.aurora@staging.gco')
    expect(personaEmail('manager', 'harbor', null, '-x')).toBe('manager.harbor-x@staging.gco')
  })
})
