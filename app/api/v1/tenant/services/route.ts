import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { getTenantServices, setTenantServices } from '@/lib/tenant/services'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_SETTINGS_VIEW')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    const view = await getTenantServices(tenantId)
    return view ? ok(view) : fail('Tenant not found', 404)
  } catch (err) {
    return handleRouteError(err)
  }
}

const Put = z
  .object({
    tenantId: z.string().max(100).optional(),
    industry: z.enum(['DATING', 'ECOMMERCE', 'SAAS', 'GAMING', 'SOCIAL_PLATFORM', 'OTHER']).nullable(),
    services: z.array(z.enum(['LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM'])).max(6),
    applyIndustryDefaults: z.boolean().optional(),
  })
  .strict()

// Which services a client has bought is a commercial fact: CEO/assistant only, audited with before -> after.
export async function PUT(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'TENANT_SETTINGS_MANAGE')
    const body = Put.parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    const view = await setTenantServices({
      tenantId,
      industry: body.industry,
      services: [...new Set(body.services)],
      actorUserId: session.sub,
      applyIndustryDefaults: body.applyIndustryDefaults,
    })
    return ok(view)
  } catch (err) {
    return handleRouteError(err)
  }
}
