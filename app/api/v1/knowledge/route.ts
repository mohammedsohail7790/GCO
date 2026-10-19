import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok } from '@/lib/api/response'
import { createEntry } from '@/lib/knowledge/service'
import { knowledgeRouteError } from '@/lib/knowledge/http'

export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'KNOWLEDGE_MANAGE')
    const tenantId = resolveTenantScope(session, new URL(req.url).searchParams.get('tenantId'))
    return ok(await db.knowledgeEntry.findMany({ where: { tenantId, archivedAt: null }, orderBy: [{ kind: 'asc' }, { title: 'asc' }], take: 500 }))
  } catch (err) {
    return knowledgeRouteError(err)
  }
}

const EntryBody = z.object({
  kind: z.enum(['QUICK_REPLY', 'ARTICLE', 'INSTRUCTION']),
  title: z.string().min(2).max(200),
  body: z.string().min(1).max(20_000),
  language: z.string().max(10).nullable().optional(),
  serviceType: z.enum(['LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM']).nullable().optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'KNOWLEDGE_MANAGE')
    const body = EntryBody.extend({ tenantId: z.string().max(100).optional() }).strict().parse(await req.json())
    const tenantId = resolveTenantScope(session, body.tenantId ?? null)
    const { tenantId: _t, ...entry } = body
    return ok(await createEntry(tenantId, entry, session.sub))
  } catch (err) {
    return knowledgeRouteError(err)
  }
}
