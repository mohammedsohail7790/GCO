import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { assertCan } from '@/lib/auth/rbac'
import { handleRouteError } from '@/lib/api/response'
import { CAREER_STATUSES, listCareerApplications } from '@/lib/careers/applications'

const Query = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(CAREER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

// Applicant personal data: CEO_ADMIN only (CAREER_VIEW). Never cached.
export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req)
    assertCan(session.role, 'CAREER_VIEW')

    const params = Object.fromEntries(new URL(req.url).searchParams)
    const query = Query.parse(params)
    const { total, items, byStatus } = await listCareerApplications(query)

    return NextResponse.json(
      { ok: true, data: items, meta: { total, page: query.page, pageSize: query.pageSize, byStatus } },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return handleRouteError(err)
  }
}
