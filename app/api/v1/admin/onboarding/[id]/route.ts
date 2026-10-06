import { NextRequest } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { db } from '@/lib/db/client'
import { ok, fail, handleRouteError } from '@/lib/api/response'
import { adminView } from '@/lib/onboarding/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(req, 'ONBOARDING_VIEW')
    const { id } = await params
    if (!(await db.clientOnboarding.findUnique({ where: { id }, select: { id: true } }))) return fail('Onboarding not found', 404)
    return ok(await adminView(id))
  } catch (err) {
    return handleRouteError(err)
  }
}
