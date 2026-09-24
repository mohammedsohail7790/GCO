import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { created, paginated, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { createLead, LeadDuplicateError } from '@/lib/crm/leads'

const CreateSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(50).optional(),
  website: z.string().max(300).optional(),
  vatId: z.string().max(50).optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
  estimatedValueEurCents: z.number().int().min(0).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)
    const stage = url.searchParams.get('stage')
    const unassignedOnly = url.searchParams.get('unassigned') === 'true'

    // HUNTER: their own leads by default, OR the shared unassigned pool
    // (?unassigned=true) to claim from - unassigned leads belong to no one,
    // so this is never "another Hunter's private data." MANAGER/CEO_ADMIN:
    // team-wide (one sales team in this MVP, so "team" == "all leads").
    let where: any = {}
    if (session.role === 'HUNTER') {
      assertCan(session.role, 'LEAD_VIEW_OWN')
      where.ownerId = unassignedOnly ? null : session.sub
    } else {
      assertCan(session.role, 'LEAD_VIEW_TEAM')
    }
    if (stage) where.pipelineStage = stage

    const [total, leads] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { owner: { select: { id: true, displayName: true, email: true } } },
      }),
    ])

    return paginated(leads, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'LEAD_CREATE')

    if (
      await isRateLimited(`crm-write:${session.sub}`, RATE_LIMITS.AUTHENTICATED_WRITE.max, RATE_LIMITS.AUTHENTICATED_WRITE.windowSeconds)
    ) {
      return fail('Rate limit exceeded', 429)
    }

    const body = CreateSchema.parse(await req.json())

    try {
      const { lead, domainWarning } = await createLead({ ...body, actorUserId: session.sub })
      return created({ lead, domainWarning })
    } catch (err) {
      if (err instanceof LeadDuplicateError) return fail(err.message, err.status, `DUPLICATE_${err.field.toUpperCase()}`)
      throw err
    }
  } catch (err) {
    return handleRouteError(err)
  }
}
