import type { AiProvider } from './types'
import { MockAiProvider } from './providers/mock'

let cached: AiProvider | undefined

/** Provider swap point - the rest of the app only ever imports `getAiProvider()`. */
export function getAiProvider(): AiProvider {
  if (cached) return cached

  const kind = process.env.AI_PROVIDER ?? 'mock'
  if (kind === 'openai') {
    // Lazy import so the OpenAI SDK/key are only required when actually selected.
    const { OpenAiProvider } = require('./providers/openai') as typeof import('./providers/openai')
    cached = new OpenAiProvider()
  } else {
    cached = new MockAiProvider()
  }
  return cached
}
