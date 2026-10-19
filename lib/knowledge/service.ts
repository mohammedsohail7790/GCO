import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { normalizeLanguage } from '@/lib/languages'

export class KnowledgeError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export interface EntryInput {
  kind: 'QUICK_REPLY' | 'ARTICLE' | 'INSTRUCTION'
  title: string
  body: string
  language?: string | null
  serviceType?: string | null
  tags?: string[]
}

function clean(i: EntryInput) {
  const title = i.title.trim()
  const body = i.body.trim()
  if (title.length < 2 || title.length > 200) throw new KnowledgeError('Title must be 2-200 characters')
  if (body.length < 1 || body.length > (i.kind === 'QUICK_REPLY' ? 2000 : 20_000)) throw new KnowledgeError(i.kind === 'QUICK_REPLY' ? 'A quick reply must be 1-2000 characters' : 'Body must be 1-20000 characters')
  const language = i.language ? normalizeLanguage(i.language) : null
  if (i.language && !language) throw new KnowledgeError('Use a two-letter language code')
  const tags = [...new Set((i.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 30))
  return { kind: i.kind, title, body, language, serviceType: (i.serviceType as never) ?? null, tags }
}

export async function createEntry(tenantId: string, i: EntryInput, actorUserId: string) {
  const e = await db.knowledgeEntry.create({ data: { tenantId, ...clean(i), createdByUserId: actorUserId } })
  await writeAuditLog({ tenantId, actorUserId, action: 'knowledge.created', resource: 'knowledge_entry', resourceId: e.id, metadata: { kind: e.kind } })
  return e
}

export async function updateEntry(tenantId: string, id: string, i: Partial<EntryInput> & { archived?: boolean }, actorUserId: string) {
  const existing = await db.knowledgeEntry.findFirst({ where: { id, tenantId } })
  if (!existing) throw new KnowledgeError('Entry not found', 404)
  const merged = clean({ kind: i.kind ?? existing.kind, title: i.title ?? existing.title, body: i.body ?? existing.body, language: i.language === undefined ? existing.language : i.language, serviceType: i.serviceType === undefined ? existing.serviceType : i.serviceType, tags: i.tags ?? existing.tags })
  const e = await db.knowledgeEntry.update({ where: { id }, data: { ...merged, ...(i.archived === undefined ? {} : { archivedAt: i.archived ? new Date() : null }), updatedByUserId: actorUserId } })
  await writeAuditLog({ tenantId, actorUserId, action: i.archived ? 'knowledge.archived' : 'knowledge.updated', resource: 'knowledge_entry', resourceId: id })
  return e
}

/**
 * What an operator sees for a conversation language: entries for their own client that apply to every language or this one.
 * Instructions come first, then quick replies and articles; optional text search over title, body and tags.
 */
export async function entriesForOperator(tenantId: string, language: string | null, q?: string | null) {
  const lang = language ? normalizeLanguage(language) : null
  const rows = await db.knowledgeEntry.findMany({
    where: { tenantId, archivedAt: null, OR: [{ language: null }, ...(lang ? [{ language: lang }] : [])] },
    orderBy: [{ kind: 'desc' }, { title: 'asc' }],
    take: 300,
  })
  const needle = q?.trim().toLowerCase()
  const hit = (e: (typeof rows)[number]) => !needle || e.title.toLowerCase().includes(needle) || e.body.toLowerCase().includes(needle) || e.tags.some((t) => t.includes(needle))
  const order = { INSTRUCTION: 0, QUICK_REPLY: 1, ARTICLE: 2 } as const
  return rows.filter(hit).sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title))
}
