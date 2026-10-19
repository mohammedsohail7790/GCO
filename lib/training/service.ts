import { db } from '@/lib/db/client'
import { writeAuditLog } from '@/lib/audit/log'
import { gradeTest, stripAnswers, validateQuestions, type Question } from './grading'

export class TrainingError extends Error {
  status: number
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function createModule(i: { tenantId: string | null; title: string; kind: 'MATERIAL' | 'TEST'; body: string; questions?: unknown; passMarkPercent?: number; required?: boolean; language?: string | null; actorUserId: string }) {
  if (i.title.trim().length < 3) throw new TrainingError('Give the module a title')
  if (i.kind === 'TEST') {
    const err = validateQuestions(i.questions)
    if (err) throw new TrainingError(err)
  }
  const pass = i.passMarkPercent ?? 80
  if (!Number.isInteger(pass) || pass < 1 || pass > 100) throw new TrainingError('Pass mark must be 1-100')
  const m = await db.trainingModule.create({
    data: { tenantId: i.tenantId, title: i.title.trim().slice(0, 200), kind: i.kind, body: i.body.slice(0, 20_000), questions: i.kind === 'TEST' ? (i.questions as never) : undefined, passMarkPercent: pass, required: !!i.required, language: i.language ?? null, createdByUserId: i.actorUserId },
  })
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'training.module_created', resource: 'training_module', resourceId: m.id, metadata: { kind: m.kind, required: m.required } })
  return m
}

/** Modules that apply to an operator: explicitly assigned ones plus every required module of their client or company-wide. */
export async function modulesFor(operatorId: string) {
  const op = await db.operator.findUniqueOrThrow({ where: { id: operatorId }, select: { tenantId: true } })
  const [assigned, required] = await Promise.all([
    db.trainingAssignment.findMany({ where: { operatorId }, select: { moduleId: true } }),
    db.trainingModule.findMany({ where: { archivedAt: null, required: true, OR: [{ tenantId: op.tenantId }, { tenantId: null }] }, select: { id: true } }),
  ])
  const ids = [...new Set([...assigned.map((a) => a.moduleId), ...required.map((r) => r.id)])]
  const [modules, records] = await Promise.all([
    db.trainingModule.findMany({ where: { id: { in: ids }, archivedAt: null }, orderBy: { createdAt: 'asc' } }),
    db.trainingAssignment.findMany({ where: { operatorId, moduleId: { in: ids } } }),
  ])
  const rec = new Map(records.map((r) => [r.moduleId, r]))
  return modules.map((m) => ({ module: m, record: rec.get(m.id) ?? null }))
}

/** Operator-facing view: test answers are stripped. */
export async function trainingForOperator(operatorId: string) {
  return (await modulesFor(operatorId)).map(({ module: m, record }) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    body: m.body,
    required: m.required,
    passMarkPercent: m.passMarkPercent,
    questions: m.kind === 'TEST' ? stripAnswers(m.questions as unknown as Question[]) : null,
    status: record?.status ?? 'ASSIGNED',
    score: record?.score ?? null,
    attempts: record?.attempts ?? 0,
    completedAt: record?.completedAt ?? null,
  }))
}

export async function assignModule(i: { moduleId: string; operatorIds: string[]; actorUserId: string }) {
  const m = await db.trainingModule.findFirst({ where: { id: i.moduleId, archivedAt: null } })
  if (!m) throw new TrainingError('Module not found', 404)
  const ops = await db.operator.findMany({ where: { id: { in: i.operatorIds }, ...(m.tenantId ? { tenantId: m.tenantId } : {}) }, select: { id: true } })
  if (ops.length !== new Set(i.operatorIds).size) throw new TrainingError('Operator not found', 404)
  for (const o of ops) await db.trainingAssignment.upsert({ where: { moduleId_operatorId: { moduleId: m.id, operatorId: o.id } }, create: { moduleId: m.id, operatorId: o.id, assignedByUserId: i.actorUserId }, update: {} })
  await writeAuditLog({ tenantId: m.tenantId, actorUserId: i.actorUserId, action: 'training.assigned', resource: 'training_module', resourceId: m.id, metadata: { operators: ops.length } })
  return { assigned: ops.length }
}

async function loadFor(operatorId: string, moduleId: string) {
  const found = (await modulesFor(operatorId)).find((x) => x.module.id === moduleId)
  if (!found) throw new TrainingError('Module not found', 404)
  return found
}

export async function completeMaterial(operatorId: string, moduleId: string) {
  const { module: m } = await loadFor(operatorId, moduleId)
  if (m.kind !== 'MATERIAL') throw new TrainingError('This module is a test - submit your answers', 400)
  return db.trainingAssignment.upsert({ where: { moduleId_operatorId: { moduleId, operatorId } }, create: { moduleId, operatorId, status: 'COMPLETED', completedAt: new Date() }, update: { status: 'COMPLETED', completedAt: new Date() } })
}

export async function submitTest(operatorId: string, moduleId: string, answers: unknown) {
  const { module: m, record } = await loadFor(operatorId, moduleId)
  if (m.kind !== 'TEST') throw new TrainingError('This module is reading material', 400)
  if (record?.status === 'COMPLETED') throw new TrainingError('You have already passed this test', 409)
  const result = gradeTest(m.questions as unknown as Question[], answers)
  const passed = result.score >= m.passMarkPercent
  await db.trainingAssignment.upsert({
    where: { moduleId_operatorId: { moduleId, operatorId } },
    create: { moduleId, operatorId, status: passed ? 'COMPLETED' : 'FAILED', score: result.score, attempts: 1, completedAt: passed ? new Date() : null },
    update: { status: passed ? 'COMPLETED' : 'FAILED', score: result.score, attempts: { increment: 1 }, completedAt: passed ? new Date() : null },
  })
  return { ...result, passed, passMarkPercent: m.passMarkPercent } // correct answers are never returned
}

export async function grantQualification(i: { operatorId: string; kind: 'CLIENT_APPROVAL' | 'SERVICE' | 'LANGUAGE'; serviceType?: string | null; language?: string | null; note?: string | null; actorUserId: string }) {
  const op = await db.operator.findUnique({ where: { id: i.operatorId }, select: { tenantId: true } })
  if (!op) throw new TrainingError('Operator not found', 404)
  if (i.kind === 'SERVICE' && !i.serviceType) throw new TrainingError('Choose the service')
  if (i.kind === 'LANGUAGE' && !i.language) throw new TrainingError('Choose the language')
  const dup = await db.qualification.findFirst({ where: { operatorId: i.operatorId, kind: i.kind, serviceType: (i.serviceType as never) ?? null, language: i.language ?? null, revokedAt: null } })
  if (dup) return dup
  const q = await db.qualification.create({ data: { operatorId: i.operatorId, tenantId: op.tenantId, kind: i.kind, serviceType: (i.serviceType as never) ?? null, language: i.language ?? null, note: i.note?.slice(0, 300) ?? null, grantedByUserId: i.actorUserId } })
  await writeAuditLog({ tenantId: op.tenantId, actorUserId: i.actorUserId, action: 'qualification.granted', resource: 'qualification', resourceId: q.id, metadata: { operatorId: i.operatorId, kind: i.kind } })
  return q
}

export async function revokeQualification(i: { id: string; tenantId: string; actorUserId: string }) {
  const r = await db.qualification.updateMany({ where: { id: i.id, tenantId: i.tenantId, revokedAt: null }, data: { revokedAt: new Date(), revokedByUserId: i.actorUserId } })
  if (r.count === 0) throw new TrainingError('Qualification not found', 404)
  await writeAuditLog({ tenantId: i.tenantId, actorUserId: i.actorUserId, action: 'qualification.revoked', resource: 'qualification', resourceId: i.id })
}

/**
 * May this operator go AVAILABLE? Needs every required module completed, and - when the client requires approval - an active
 * CLIENT_APPROVAL qualification. Returns what is missing so the operator can be told exactly why.
 */
export async function trainingGate(operatorId: string): Promise<{ cleared: boolean; missingModules: string[]; needsApproval: boolean }> {
  const op = await db.operator.findUniqueOrThrow({ where: { id: operatorId }, select: { tenantId: true, tenant: { select: { requireOperatorApproval: true } } } })
  const mods = await modulesFor(operatorId)
  const missingModules = mods.filter((x) => x.module.required && x.record?.status !== 'COMPLETED').map((x) => x.module.title)
  let needsApproval = false
  if (op.tenant.requireOperatorApproval) {
    needsApproval = !(await db.qualification.findFirst({ where: { operatorId, tenantId: op.tenantId, kind: 'CLIENT_APPROVAL', revokedAt: null }, select: { id: true } }))
  }
  return { cleared: missingModules.length === 0 && !needsApproval, missingModules, needsApproval }
}

/** Manager overview: each operator's required/optional progress and active qualifications. */
export async function overview(operatorIds: string[]) {
  const ops = await db.operator.findMany({ where: { id: { in: operatorIds } }, orderBy: { operatorNumber: 'asc' }, select: { id: true, operatorNumber: true, user: { select: { displayName: true } } } })
  const quals = await db.qualification.findMany({ where: { operatorId: { in: operatorIds }, revokedAt: null } })
  const out = []
  for (const o of ops) {
    const mods = await modulesFor(o.id)
    out.push({
      operatorId: o.id,
      number: o.operatorNumber,
      name: o.user.displayName,
      completed: mods.filter((x) => x.record?.status === 'COMPLETED').length,
      total: mods.length,
      requiredOutstanding: mods.filter((x) => x.module.required && x.record?.status !== 'COMPLETED').map((x) => x.module.title),
      failedTests: mods.filter((x) => x.record?.status === 'FAILED').map((x) => ({ title: x.module.title, score: x.record!.score })),
      qualifications: quals.filter((q) => q.operatorId === o.id).map((q) => ({ id: q.id, kind: q.kind, serviceType: q.serviceType, language: q.language })),
    })
  }
  return out
}
