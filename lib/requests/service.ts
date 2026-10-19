import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { clientContactsFor, gcoContactsFor, notifyUsers } from '@/lib/notify/service'

export class RequestError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export async function createRequest(i: { tenantId: string; userId: string; kind: 'WORKFLOW_CHANGE' | 'INSTRUCTION_CHANGE' | 'SETTINGS_CHANGE' | 'MESSAGE'; subject: string; body: string }) {
  const subject = i.subject.trim(), body = i.body.trim()
  if (subject.length < 3 || subject.length > 200) throw new RequestError('Give the request a short subject')
  if (body.length < 3 || body.length > 5000) throw new RequestError('Describe what you need (up to 5000 characters)')
  const r = await db.$transaction(async (tx) => {
    const req = await tx.clientRequest.create({ data: { tenantId: i.tenantId, kind: i.kind, subject, createdByUserId: i.userId } })
    await tx.clientMessage.create({ data: { requestId: req.id, tenantId: i.tenantId, authorUserId: i.userId, fromClient: true, body } })
    return req
  })
  await notifyUsers(await gcoContactsFor(i.tenantId), 'client_request', { requestId: r.id, kind: r.kind, subject: r.subject }, i.tenantId)
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: 'client_request.created', resource: 'client_request', resourceId: r.id, metadata: { kind: r.kind } })
  return r
}

/** `side` decides who may post: the client in its own thread, or GCO staff. A closed (DONE/DECLINED) request reopens when the client writes again. */
export async function addMessage(i: { requestId: string; tenantId: string; userId: string; fromClient: boolean; body: string }) {
  const body = i.body.trim()
  if (body.length < 1 || body.length > 5000) throw new RequestError('Write a message (up to 5000 characters)')
  const req = await db.clientRequest.findFirst({ where: { id: i.requestId, tenantId: i.tenantId } })
  if (!req) throw new RequestError('Request not found', 404)
  const m = await db.$transaction(async (tx) => {
    const msg = await tx.clientMessage.create({ data: { requestId: req.id, tenantId: i.tenantId, authorUserId: i.userId, fromClient: i.fromClient, body } })
    if (i.fromClient && (req.status === 'DONE' || req.status === 'DECLINED')) await tx.clientRequest.update({ where: { id: req.id }, data: { status: 'OPEN', resolvedAt: null } })
    else await tx.clientRequest.update({ where: { id: req.id }, data: { updatedAt: new Date() } })
    return msg
  })
  const to = i.fromClient ? await gcoContactsFor(i.tenantId) : await clientContactsFor(i.tenantId)
  await notifyUsers(to.filter((u) => u !== i.userId), i.fromClient ? 'client_request_reply' : 'gco_reply', { requestId: req.id, subject: req.subject }, i.tenantId)
  return m
}

export async function setStatus(i: { requestId: string; tenantId: string; userId: string; status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'DECLINED'; note?: string | null }) {
  const req = await db.clientRequest.findFirst({ where: { id: i.requestId, tenantId: i.tenantId } })
  if (!req) throw new RequestError('Request not found', 404)
  const closing = i.status === 'DONE' || i.status === 'DECLINED'
  if (i.status === 'DECLINED' && (i.note ?? '').trim().length < 3) throw new RequestError('Say why you are declining')
  await db.clientRequest.update({ where: { id: req.id }, data: { status: i.status, resolvedAt: closing ? new Date() : null } })
  if (i.note?.trim()) await db.clientMessage.create({ data: { requestId: req.id, tenantId: i.tenantId, authorUserId: i.userId, fromClient: false, body: i.note.trim().slice(0, 5000) } })
  await notifyUsers(await clientContactsFor(i.tenantId), 'client_request_status', { requestId: req.id, subject: req.subject, status: i.status }, i.tenantId)
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.userId, action: 'client_request.status', resource: 'client_request', resourceId: req.id, metadata: { status: i.status } })
}

export async function thread(requestId: string, tenantId: string) {
  const req = await db.clientRequest.findFirst({ where: { id: requestId, tenantId } })
  if (!req) throw new RequestError('Request not found', 404)
  const messages = await db.clientMessage.findMany({ where: { requestId }, orderBy: { createdAt: 'asc' }, select: { id: true, fromClient: true, body: true, createdAt: true } })
  return { request: { id: req.id, kind: req.kind, subject: req.subject, status: req.status, createdAt: req.createdAt }, messages }
}
