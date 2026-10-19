import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db/client'
import { ForbiddenError } from './tenantGuard'
import type { AccessTokenClaims } from './tokens'

// Team scoping for SUPERVISOR. A supervisor's tenant scope (resolveTenantScope) is necessary but not sufficient for
// operator-centric data: they only see operators whose Operator.supervisorUserId is themselves. Every other role is unaffected.

export const isSupervisor = (session: Pick<AccessTokenClaims, 'role'>) => session.role === 'SUPERVISOR'

/** Extra Prisma filter for Operator queries: the supervisor's own team, nothing for other roles. */
export function operatorTeamFilter(session: Pick<AccessTokenClaims, 'role' | 'sub'>): Prisma.OperatorWhereInput {
  return isSupervisor(session) ? { supervisorUserId: session.sub } : {}
}

/** Operator ids and their user ids for a supervisor's team within one tenant. */
export async function supervisorTeam(supervisorUserId: string, tenantId: string) {
  const ops = await db.operator.findMany({ where: { tenantId, supervisorUserId }, select: { id: true, userId: true } })
  return { operatorIds: ops.map((o) => o.id), userIds: ops.map((o) => o.userId) }
}

/** Throws 403 for a supervisor acting on an operator outside their team. A no-op for every other role. */
export async function assertOperatorInTeam(session: Pick<AccessTokenClaims, 'role' | 'sub'>, operatorId: string | null | undefined) {
  if (!isSupervisor(session)) return
  const op = operatorId ? await db.operator.findUnique({ where: { id: operatorId }, select: { supervisorUserId: true } }) : null
  if (!op || op.supervisorUserId !== session.sub) throw new ForbiddenError('Operator is not in your team')
}
