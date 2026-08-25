// Central feature-flag and business-rule-default reader.
// All values are env-driven so they can change per-deployment without code changes.
// Per-tenant overrides (capacity, SLA, pricing) live in the Tenant/Operator DB rows
// and take precedence over these system defaults - see lib/config/tenantConfig.ts.

function boolEnv(key: string, fallback: boolean): boolean {
  const v = process.env[key]
  if (v === undefined) return fallback
  return v.toLowerCase() === 'true'
}

function intEnv(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined) return fallback
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? fallback : n
}

export const flags = {
  aiSuggestions: boolEnv('FEATURE_AI_SUGGESTIONS', true),
  aiMemory: boolEnv('FEATURE_AI_MEMORY', true),
  autoReassignment: boolEnv('FEATURE_AUTO_REASSIGNMENT', true),
  clientTickets: boolEnv('FEATURE_CLIENT_TICKETS', true),
  emergencyControls: boolEnv('FEATURE_EMERGENCY_CONTROLS', true),
  advancedAnalytics: boolEnv('FEATURE_ADVANCED_ANALYTICS', false),
}

export const defaults = {
  operatorCapacity: intEnv('DEFAULT_OPERATOR_CAPACITY', 2),
  responseSlaSeconds: intEnv('DEFAULT_RESPONSE_SLA_SECONDS', 120),
  pricePerMessageEurCents: Math.round(
    parseFloat(process.env.DEFAULT_PRICE_PER_MESSAGE_EUR ?? '0.14') * 100,
  ),
  operatorCostPerMessageEurCents: Math.round(
    parseFloat(process.env.DEFAULT_OPERATOR_COST_PER_MESSAGE_EUR ?? '0.06') * 100,
  ),
  founderRevenueSharePercent: parseFloat(process.env.FOUNDER_REVENUE_SHARE_PERCENT ?? '5'),
}
