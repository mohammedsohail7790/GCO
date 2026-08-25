import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'

const UpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeUserId: z.string().nullable().optional(),
  note: z.string().max(2000).optional(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession(req)
    const ticket = await db.ticket.findUnique({ where: { id }, include: { history: true } })
    if (!ticket) return fail('Ticket not found', 404)
    if (session.role === 'CLIENT' && ticket.creatorUserId !== session.sub) return fail('Forbidden', 403)
    const isGlobalStaff = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    if (session.role !== 'CLIENT' && !isGlobalStaff && session.tenantId !== ticket.tenantId) {
      return fail('Forbidden', 403)
    }
    return ok(ticket)
  } catch (err) {
    return handleRouteError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const session = await getSession(req)
    assertCan(session.role, 'TICKET_MANAGE')

    const ticket = await db.ticket.findUnique({ where: { id } })
    if (!ticket) return fail('Ticket not found', 404)
    const isGlobalStaff = session.role === 'CEO_ADMIN' || session.role === 'ASSISTANT'
    if (!isGlobalStaff && session.tenantId !== ticket.tenantId) return fail('Forbidden', 403)

    const body = UpdateSchema.parse(await req.json())

    const updated = await db.ticket.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
        assigneeUserId: body.assigneeUserId,
      },
    })

    await db.ticketHistoryEntry.create({
      data: {
        ticketId: ticket.id,
        actorUserId: session.sub,
        action: 'updated',
        metadata: body as any,
      },
    })

    return ok(updated)
  } catch (err) {
    return handleRouteError(err)
  }
}
