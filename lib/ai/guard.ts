// AI MASTER SWITCH. By direction of the CEO, AI is DISABLED. Nothing in the platform may produce, queue or request AI output unless
// BOTH are true: this switch is set to exactly "enabled", AND (for any external provider) a second, separate approval is set.
// Defaults, missing variables, a typo, a restart or a redeploy all resolve to DISABLED. See docs/technical-security-pack/08.

export class AiDisabledError extends Error {
  constructor(message = 'AI is disabled') {
    super(message)
    this.name = 'AiDisabledError'
  }
}

/** The master switch. Only the exact value "enabled" turns AI on (not "true", "1", "yes" or "ENABLED"). */
export const isAiEnabled = (): boolean => process.env.AI_MASTER_SWITCH === 'enabled'

/** A real (external) provider additionally needs this explicit approval, so a mock-enabled test stack can never call out by accident. */
export const isExternalAiApproved = (): boolean => process.env.AI_EXTERNAL_PROVIDER_APPROVED === 'yes'

/** Content-free status for health checks and audits. Never includes keys. */
export function aiStatus(): { enabled: boolean; mode: 'disabled' | 'mock' | 'external' } {
  if (!isAiEnabled()) return { enabled: false, mode: 'disabled' }
  const kind = process.env.AI_PROVIDER ?? 'mock'
  return { enabled: true, mode: kind === 'openai' && isExternalAiApproved() ? 'external' : kind === 'openai' ? 'disabled' : 'mock' }
}
