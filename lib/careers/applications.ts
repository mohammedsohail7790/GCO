import { Prisma, type CareerApplicationStatus } from '@prisma/client'
import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'

export const CAREER_STATUSES = ['NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED'] as const

export interface ApplicationInput {
  fullName: string
  email: string
  phone?: string
  country?: string
  languages?: string
  message?: string
}

export const normalizeApplicantEmail = (email: string) => email.trim().toLowerCase()

/**
 * Persist a public application. A repeat from the same email (case-insensitive) while the earlier
 * application is still NEW/REVIEWING updates that row instead of creating a duplicate; once an
 * application is ACCEPTED/REJECTED a new submission is a fresh row (a re-application).
 * Never touches email: persistence does not depend on any notification channel.
 */
export async function submitCareerApplication(input: ApplicationInput) {
  const email = normalizeApplicantEmail(input.email)
  const data = {
    fullName: input.fullName.trim(),
    phone: input.phone || null,
    country: input.country || null,
    languages: input.languages || null,
    message: input.message || null,
  }
  const open = await db.careerApplication.findFirst({
    where: { email: { equals: email, mode: 'insensitive' }, status: { in: ['NEW', 'REVIEWING'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (open) {
    const updated = await db.careerApplication.update({
      where: { id: open.id },
      data: { ...data, submissionCount: { increment: 1 }, lastSubmittedAt: new Date() },
      select: { id: true },
    })
    return { id: updated.id, duplicate: true }
  }
  const created = await db.careerApplication.create({ data: { ...data, email }, select: { id: true } })
  return { id: created.id, duplicate: false }
}

export interface ListFilters { q?: string; status?: CareerApplicationStatus; page: number; pageSize: number }

export async function listCareerApplications(f: ListFilters) {
  const q = f.q?.trim()
  const where: Prisma.CareerApplicationWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { country: { contains: q, mode: 'insensitive' } },
            { languages: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
  const [total, items, counts] = await Promise.all([
    db.careerApplication.count({ where }),
    db.careerApplication.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    db.careerApplication.groupBy({ by: ['status'], _count: { _all: true } }),
  ])
  const byStatus: Record<string, number> = { NEW: 0, REVIEWING: 0, ACCEPTED: 0, REJECTED: 0 }
  for (const c of counts) byStatus[c.status] = c._count._all
  return { total, items, byStatus }
}

/** Status change + audit entry (never contains applicant PII - ids and statuses only). */
export async function setApplicationStatus(params: {
  id: string
  status: CareerApplicationStatus
  reviewNote?: string
  actorUserId: string
}) {
  const existing = await db.careerApplication.findUnique({ where: { id: params.id } })
  if (!existing) return null
  const nextNote = params.reviewNote === undefined ? undefined : params.reviewNote.trim() || null
  const noteChanged = nextNote !== undefined && nextNote !== existing.reviewNote
  if (existing.status === params.status && !noteChanged) return existing // nothing to change, nothing to audit
  const updated = await db.careerApplication.update({
    where: { id: params.id },
    data: {
      status: params.status,
      statusUpdatedAt: new Date(),
      statusUpdatedBy: params.actorUserId,
      ...(noteChanged ? { reviewNote: nextNote } : {}),
    },
  })
  await writeAuditLog({
    actorUserId: params.actorUserId,
    action: 'career_application.status_changed',
    resource: 'career_application',
    resourceId: params.id,
    metadata: { from: existing.status, to: params.status, noteChanged },
  })
  return updated
}
