import type { AiProvider } from './types'
import { MockAiProvider } from './providers/mock'
import { AiDisabledError, isAiEnabled, isExternalAiApproved } from './guard'

let cached: AiProvider | undefined

/** Provider swap point - the rest of the app only ever imports `getAiProvider()`. */
export function getAiProvider(): AiProvider {
  // The guard is evaluated on EVERY call (never cached) so switching AI off takes effect immediately and cannot be bypassed by a warm cache.
  if (!isAiEnabled()) throw new AiDisabledError()
  const kind = process.env.AI_PROVIDER ?? 'mock'
  if (kind === 'openai' && !isExternalAiApproved()) throw new AiDisabledError('External AI provider is not approved')
  if (cached && cached.name === (kind === 'openai' ? 'openai' : 'mock')) return cached

  if (kind === 'openai') {
    // Lazy import so the OpenAI SDK/key are only required when actually selected.
    const { OpenAiProvider } = require('./providers/openai') as typeof import('./providers/openai')
    cached = new OpenAiProvider()
  } else {
    cached = new MockAiProvider()
  }
  return cached
}
