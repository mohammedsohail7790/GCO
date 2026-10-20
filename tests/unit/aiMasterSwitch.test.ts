import fs from 'fs'
import path from 'path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isAiEnabled, isExternalAiApproved, aiStatus, AiDisabledError } from '@/lib/ai/guard'
import { getAiProvider } from '@/lib/ai/provider'
import { flags } from '@/lib/config/flags'

// AI is DISABLED by CEO direction. These tests prove the DEFAULT is off and that nothing short of an explicit, exact opt-in changes that.
const KEYS = ['AI_MASTER_SWITCH', 'AI_PROVIDER', 'AI_EXTERNAL_PROVIDER_APPROVED', 'OPENAI_API_KEY', 'FEATURE_AI_SUGGESTIONS', 'FEATURE_AI_MEMORY'] as const
const saved: Record<string, string | undefined> = {}
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k] } })
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } vi.resetModules() })

describe('AI master switch: default is OFF', () => {
  it('with no environment at all, AI is disabled everywhere', () => {
    expect(isAiEnabled()).toBe(false)
    expect(flags.aiSuggestions).toBe(false); expect(flags.aiMemory).toBe(false)
    expect(aiStatus()).toEqual({ enabled: false, mode: 'disabled' })
    expect(() => getAiProvider()).toThrow(AiDisabledError)
  })
  it('only the exact value "enabled" turns it on - typos, truthy words and other cases do not', () => {
    for (const v of ['', 'true', 'TRUE', '1', 'yes', 'on', 'ENABLED', 'Enabled', ' enabled', 'enabled ', 'disabled']) {
      process.env.AI_MASTER_SWITCH = v
      expect(isAiEnabled(), `value ${JSON.stringify(v)}`).toBe(false)
      expect(() => getAiProvider()).toThrow(AiDisabledError)
    }
    process.env.AI_MASTER_SWITCH = 'enabled'
    expect(isAiEnabled()).toBe(true)
  })
  it('feature flags cannot enable AI on their own', () => {
    process.env.FEATURE_AI_SUGGESTIONS = 'true'; process.env.FEATURE_AI_MEMORY = 'true'
    expect(flags.aiSuggestions).toBe(false); expect(flags.aiMemory).toBe(false)
  })
  it('selecting the OpenAI provider and supplying a key does not enable it', () => {
    process.env.AI_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'sk-test-not-real'
    expect(() => getAiProvider()).toThrow(AiDisabledError)
    expect(aiStatus().enabled).toBe(false)
  })
})

describe('AI master switch: opt-in is layered', () => {
  it('enabled with the default (mock) provider returns the deterministic mock and never an external one', () => {
    process.env.AI_MASTER_SWITCH = 'enabled'
    expect(getAiProvider().name).toBe('mock')
    expect(aiStatus()).toEqual({ enabled: true, mode: 'mock' })
    expect(flags.aiSuggestions).toBe(true)
  })
  it('an external provider needs a SECOND approval even when AI is enabled and a key exists', () => {
    process.env.AI_MASTER_SWITCH = 'enabled'; process.env.AI_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'sk-test-not-real'
    expect(() => getAiProvider()).toThrow(/not approved/i)
    expect(aiStatus().mode).toBe('disabled')
    for (const v of ['true', 'YES', '1', 'y']) { process.env.AI_EXTERNAL_PROVIDER_APPROVED = v; expect(isExternalAiApproved()).toBe(false); expect(() => getAiProvider()).toThrow(AiDisabledError) }
    process.env.AI_EXTERNAL_PROVIDER_APPROVED = 'yes'
    expect(isExternalAiApproved()).toBe(true)
    expect(aiStatus().mode).toBe('external') // reached only with both explicit approvals (not exercised here: no live call is made)
  })
  it('switching AI off takes effect immediately, even after a provider was already created', () => {
    process.env.AI_MASTER_SWITCH = 'enabled'
    expect(getAiProvider().name).toBe('mock')
    process.env.AI_MASTER_SWITCH = 'disabled'
    expect(() => getAiProvider()).toThrow(AiDisabledError)
  })
})

describe('deployment files pin AI off', () => {
  const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8')
  it('production compose sets AI_MASTER_SWITCH: disabled in the committed file for web, worker and realtime', () => {
    expect((read('docker-compose.yml').match(/AI_MASTER_SWITCH: disabled/g) ?? []).length).toBe(3)
    expect(read('docker-compose.yml')).not.toMatch(/AI_MASTER_SWITCH:\s*(enabled|\$)/)
  })
  it('staging compose pins it off too', () => {
    expect(read('docker-compose.staging.yml')).toMatch(/AI_MASTER_SWITCH: disabled/)
    expect(read('docker-compose.staging.yml')).not.toMatch(/AI_PROVIDER:\s*openai/)
  })
  it('the env examples default to disabled and carry no key', () => {
    for (const f of ['.env.example', '.env.staging.example']) { expect(read(f)).toMatch(/^AI_MASTER_SWITCH=disabled$/m); expect(read(f)).toMatch(/^OPENAI_API_KEY=$/m) }
  })
})
