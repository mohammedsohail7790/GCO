import type { Industry, ServiceType } from '@prisma/client'

// Data-driven workspace templates: the industry picks the starting point, purchased services pick the
// active modules. Nothing here is per-client code - a new industry or service is a new entry in these tables.
//
// A module is a workspace capability a service switches on. `built` is the honest state of the platform:
// modules flagged false are planned (see docs/GCO_CEO_VISION_ASSESSMENT.md) and must not be sold as live.

export const MODULES = {
  conversations: { label: 'Live conversations', built: true },
  tickets: { label: 'Support tickets', built: true },
  escalations: { label: 'Escalations', built: true },
  qa_review: { label: 'Quality review', built: true },
  language_routing: { label: 'Language routing', built: true },
  language_coverage: { label: 'Language coverage report', built: true },
  sla_reassignment: { label: 'SLA alerts and automatic reassignment', built: true },
  quick_replies: { label: 'Quick replies', built: false },
  knowledge_base: { label: 'Knowledge base', built: false },
  customer_records: { label: 'Customer records and orders', built: false },
  profiles_review: { label: 'Profile and image review', built: false },
  moderation_queue: { label: 'Moderation queue', built: false },
  community_reports: { label: 'Posts, comments and reports', built: false },
  moderation_appeals: { label: 'Moderation appeals', built: false },
  translation: { label: 'Translation tools', built: false },
  shift_planner: { label: 'Shift planning and handovers', built: false },
  dedicated_workflows: { label: 'Client-specific workflows', built: false },
} as const

export type ModuleKey = keyof typeof MODULES

export const SERVICE_MODULES: Record<ServiceType, readonly ModuleKey[]> = {
  LIVE_CHAT_SUPPORT: ['conversations', 'tickets', 'escalations', 'qa_review', 'sla_reassignment', 'quick_replies', 'knowledge_base'],
  CHAT_MODERATION: ['conversations', 'escalations', 'qa_review', 'moderation_queue', 'profiles_review'],
  COMMUNITY_MODERATION: ['escalations', 'qa_review', 'moderation_queue', 'community_reports', 'moderation_appeals'],
  MULTILINGUAL_CHAT: ['conversations', 'language_routing', 'language_coverage', 'translation'],
  COVERAGE_24_7: ['conversations', 'sla_reassignment', 'shift_planner'],
  DEDICATED_TEAM: ['conversations', 'escalations', 'qa_review', 'dedicated_workflows', 'knowledge_base'],
}

export interface IndustryTemplate {
  label: string
  /** Services proposed when the industry is chosen; the wizard may change them. */
  suggestedServices: readonly ServiceType[]
  /** Extra modules the industry adds on top of the purchased services (only active if some service is on). */
  extraModules: readonly ModuleKey[]
  responseSlaSeconds: number
  operatorCapacity: number
}

export const INDUSTRY_TEMPLATES: Record<Industry, IndustryTemplate> = {
  DATING: { label: 'Dating', suggestedServices: ['CHAT_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7'], extraModules: ['profiles_review', 'translation'], responseSlaSeconds: 60, operatorCapacity: 2 },
  ECOMMERCE: { label: 'E-commerce', suggestedServices: ['LIVE_CHAT_SUPPORT'], extraModules: ['customer_records', 'tickets'], responseSlaSeconds: 120, operatorCapacity: 3 },
  SAAS: { label: 'SaaS', suggestedServices: ['LIVE_CHAT_SUPPORT'], extraModules: ['knowledge_base', 'tickets'], responseSlaSeconds: 180, operatorCapacity: 3 },
  GAMING: { label: 'Gaming', suggestedServices: ['CHAT_MODERATION', 'COMMUNITY_MODERATION'], extraModules: ['moderation_queue'], responseSlaSeconds: 60, operatorCapacity: 4 },
  SOCIAL_PLATFORM: { label: 'Social platform', suggestedServices: ['COMMUNITY_MODERATION', 'CHAT_MODERATION'], extraModules: ['community_reports', 'moderation_appeals'], responseSlaSeconds: 300, operatorCapacity: 3 },
  OTHER: { label: 'Other', suggestedServices: ['LIVE_CHAT_SUPPORT'], extraModules: [], responseSlaSeconds: 120, operatorCapacity: 2 },
}

export interface ResolvedWorkspace {
  modules: ModuleKey[]
  /** Active modules that exist in the platform today. */
  availableModules: ModuleKey[]
  /** Active modules still to be built - shown to staff so nothing is promised that does not exist. */
  plannedModules: ModuleKey[]
}

/** Pure: which modules does a tenant with this industry and these ENABLED services get? */
export function resolveWorkspace(industry: Industry | null, enabledServices: readonly ServiceType[]): ResolvedWorkspace {
  const set = new Set<ModuleKey>()
  for (const s of enabledServices) for (const m of SERVICE_MODULES[s] ?? []) set.add(m)
  if (industry && enabledServices.length > 0) for (const m of INDUSTRY_TEMPLATES[industry].extraModules) set.add(m)
  const modules = [...set].sort()
  return {
    modules,
    availableModules: modules.filter((m) => MODULES[m].built),
    plannedModules: modules.filter((m) => !MODULES[m].built),
  }
}
