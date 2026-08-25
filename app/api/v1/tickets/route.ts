import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { resolveTenantScope } from '@/lib/auth/tenantGuard'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, created, paginated, fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'

const CreateSchema = z.object({
  type: z.enum(['FEEDBACK', 'REQUEST', 'COMPLAINT', 'OPERATIONAL_ISSUE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  subject: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    const url = new URL(req.url)
    const tenantId = resolveTenantScope(session, url.searchParams.get('tenantId'))
    const page = Math.max(parseInt(url.searchParams.get('page') ?? '1', 10), 1)
    const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') ?? '25', 10), 100)

    const where =
      session.role === 'CLIENT'
        ? { tenantId, creatorUserId: session.sub } // clients only ever see their own tickets
        : { tenantId }

    const [total, tickets] = await Promise.all([
      db.ticket.count({ where }),
      db.ticket.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ])

    return paginated(tickets, { total, page, pageSize })
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req)
    if (session.role !== 'CLIENT') {
      assertCan(session.role, 'TICKET_MANAGE') // internal staff may also file tickets on behalf of ops
    }
    const body = CreateSchema.parse(await req.json())
    if (!session.tenantId) return fail('No tenant context', 400)

    const ticket = await db.ticket.create({
      data: {
        tenantId: session.tenantId,
        creatorUserId: session.sub,
        type: body.type,
        priority: body.priority,
        subject: body.subject,
        description: body.description,
      },
    })

    await db.ticketHistoryEntry.create({
      data: { ticketId: ticket.id, actorUserId: session.sub, action: 'created' },
    })
    await writeAuditLog({
      tenantId: session.tenantId,
      actorUserId: session.sub,
      action: 'ticket.create',
      resource: 'ticket',
      resourceId: ticket.id,
    })

    return created(ticket)
  } catch (err) {
    return handleRouteError(err)
  }
}
