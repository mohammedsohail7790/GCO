import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const PatchSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  contactName: z.string().min(1).max(200).optional(),
  phone: z.string().max(50).optional(),
  website: z.string().max(300).optional(),
  industry: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  notes: z.string().max(5000).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const lead = await db.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, displayName: true, email: true } },
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
        approvals: { orderBy: { createdAt: 'desc' } },
        commissions: true,
      },
    })
    if (!lead) return fail('Lead not found', 404)

    if (session.role === 'HUNTER') {
      assertCan(session.role, 'LEAD_VIEW_OWN')
      if (lead.ownerId !== session.sub) return fail('Forbidden', 403)
    } else {
      assertCan(session.role, 'LEAD_VIEW_TEAM')
    }

    return ok(lead)
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req)
    const { id } = await params
    const lead = await db.lead.findUnique({ where: { id } })
    if (!lead) return fail('Lead not found', 404)

    if (session.role === 'HUNTER') {
      if (lead.ownerId !== session.sub) return fail('Forbidden', 403)
    } else {
      assertCan(session.role, 'LEAD_VIEW_TEAM')
    }

    const body = PatchSchema.parse(await req.json())
    const updated = await db.lead.update({ where: { id }, data: body })
    await db.leadHistoryEntry.create({ data: { leadId: id, actorUserId: session.sub, action: 'edited', metadata: body } })

    return ok(updated)
  } catch (err) {
    return handleRouteError(err)
  }
}
