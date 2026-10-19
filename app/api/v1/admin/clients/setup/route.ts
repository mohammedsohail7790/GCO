import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { OnboardingError } from '@/lib/onboarding/service'
import { INDUSTRY_TEMPLATES, resolveWorkspace } from '@/lib/tenant/templates'
import { runWizard, type WizardInput } from '@/lib/onboarding/wizard'

const cents = z.number().int().min(0).max(10_000_000)
const Body = z
  .object({
    company: z.object({ name: z.string().min(2).max(200), slug: z.string().min(2).max(60) }).strict(),
    industry: z.enum(['DATING', 'ECOMMERCE', 'SAAS', 'GAMING', 'SOCIAL_PLATFORM', 'OTHER']),
    services: z.array(z.enum(['LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM'])).min(1).max(6),
    languages: z.array(z.string().max(10)).max(12).default([]),
    timezone: z.string().max(64).default('Europe/Rome'),
    operatingHours: z.record(z.string(), z.object({ open: z.string(), close: z.string() }).strict()).nullable().default(null),
    responseSlaSeconds: z.number().int(),
    operatorCapacity: z.number().int(),
    messageCap: z.number().int().nullable().default(null),
    billing: z.object({ model: z.enum(['PER_MESSAGE', 'PER_TICKET', 'PER_HOUR', 'MONTHLY_FLAT']), pricePerMessageEurCents: cents, pricePerTicketEurCents: cents.nullable().default(null), pricePerHourEurCents: cents.nullable().default(null), monthlyFeeEurCents: cents.nullable().default(null), vatRatePercent: z.number().int(), vatNote: z.string().max(300).nullable().default(null) }).strict(),
    operatorPay: z.object({ amountEurCents: cents, basis: z.enum(['DELIVERED', 'APPROVED']) }).strict().nullable().default(null),
    aiMode: z.enum(['HUMAN_ONLY', 'AI_ASSISTED', 'AI_PLUS_HUMAN']).default('AI_ASSISTED'),
    requireOperatorApproval: z.boolean().default(false),
    clientContact: z.object({ email: z.string().max(200), name: z.string().min(1).max(120) }).strict().nullable().default(null),
    staff: z.array(z.object({ email: z.string().max(200), name: z.string().min(1).max(120), role: z.enum(['MANAGER', 'SUPERVISOR', 'OPERATOR']), languages: z.array(z.string().max(10)).max(12).optional() }).strict()).max(50).default([]),
  })
  .strict()

/** Industry templates (defaults the wizard pre-fills) and the modules each service switches on, for the setup form. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission(req, 'TENANT_MANAGE')
    return ok(Object.entries(INDUSTRY_TEMPLATES).map(([key, t]) => ({ key, ...t, workspace: resolveWorkspace(key as never, t.suggestedServices as never) })))
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_MANAGE')
    if (await isRateLimited(`admin-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)) return fail('Rate limit exceeded', 429)
    const body = Body.parse(await req.json())
    return ok(await runWizard(body as unknown as WizardInput, session.sub))
  } catch (err) {
    if (err instanceof OnboardingError) return fail(err.message, err.status, err.code)
    return handleRouteError(err)
  }
}
