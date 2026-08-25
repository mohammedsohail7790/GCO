import { NextRequest } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { created, handleRouteError, fail } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { defaults } from '@/lib/config/flags'

const CreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  displayName: z.string().min(1).max(120),
  role: z.enum(['CEO_ADMIN', 'MANAGER', 'ASSISTANT', 'OPERATOR', 'CLIENT']),
  tenantId: z.string().nullable().optional(),
  operatorCapacity: z.number().int().positive().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'USER_MANAGE')
    const body = CreateSchema.parse(await req.json())

    // CLIENT/OPERATOR/MANAGER are tenant-scoped roles (they manage or belong to
    // one client relationship - see lib/auth/tenantGuard.ts::resolveTenantScope).
    // CEO_ADMIN and ASSISTANT are global/operational roles with no single tenant.
    const tenantScopedRoles = ['CLIENT', 'OPERATOR', 'MANAGER']
    if (tenantScopedRoles.includes(body.role) && !body.tenantId) {
      return fail(`role ${body.role} requires a tenantId`, 400)
    }

    const passwordHash = await bcrypt.hash(body.password, 12)

    const user = await db.user.create({
      data: {
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: body.role,
        tenantId: tenantScopedRoles.includes(body.role) ? body.tenantId : null,
      },
    })

    if (body.role === 'OPERATOR') {
      await db.operator.create({
        data: {
          userId: user.id,
          tenantId: body.tenantId!,
          capacity: body.operatorCapacity ?? defaults.operatorCapacity,
          services: { create: { tenantId: body.tenantId! } },
        },
      })
    }

    await writeAuditLog({
      tenantId: body.tenantId ?? null,
      actorUserId: session.sub,
      action: 'user.create',
      resource: 'user',
      resourceId: user.id,
      metadata: { role: body.role, email: body.email },
    })

    return created({ id: user.id, email: user.email, role: user.role, tenantId: user.tenantId })
  } catch (err) {
    return handleRouteError(err)
  }
}
