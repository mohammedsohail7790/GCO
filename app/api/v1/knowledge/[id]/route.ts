import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api/guard'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { db } from '@/lib/db/client'
import { ok, fail } from '@/lib/api/response'
import { updateEntry } from '@/lib/knowledge/service'
import { knowledgeRouteError } from '@/lib/knowledge/http'

const Body = z
  .object({
    title: z.string().min(2).max(200).optional(),
    body: z.string().min(1).max(20_000).optional(),
    language: z.string().max(10).nullable().optional(),
    serviceType: z.enum(['LIVE_CHAT_SUPPORT', 'CHAT_MODERATION', 'COMMUNITY_MODERATION', 'MULTILINGUAL_CHAT', 'COVERAGE_24_7', 'DEDICATED_TEAM']).nullable().optional(),
    tags: z.array(z.string().max(30)).max(10).optional(),
    archived: z.boolean().optional(),
  })
  .strict()

// Entries are archived, not deleted, so a reply an operator used last month can still be traced.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission(req, 'KNOWLEDGE_MANAGE')
    const { id } = await params
    const body = Body.parse(await req.json())
    const existing = await db.knowledgeEntry.findUnique({ where: { id }, select: { tenantId: true } })
    if (!existing) return fail('Entry not found', 404)
    const tenantId = resolveTenantScope(session, existing.tenantId)
    if (tenantId !== existing.tenantId) return fail('Entry not found', 404)
    return ok(await updateEntry(tenantId, id, body, session.sub))
  } catch (err) {
    return knowledgeRouteError(err)
  }
}
