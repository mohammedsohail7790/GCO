import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api/guard'
import { fail, handleRouteError } from '@/lib/api/response'
import { writeAuditLog } from '@/lib/audit/log'
import { verifyExportLink } from '@/lib/exports/link'
import { buildExport, ExportTooLargeError } from '@/lib/exports/build'

// Step 2: the link is only honoured for the user who requested it, before it expires, with the exact filter that was authorised. The
// permission is checked again (a role removed after step 1 gets nothing) and each download is audited. Nothing is stored on the server.
export async function GET(req: NextRequest) {
  try {
    const session = await requirePermission(req, 'BILLING_MANAGE')
    const token = new URL(req.url).searchParams.get('token') ?? ''
    const r = verifyExportLink(token, session.sub)
    if (!r) return fail('This download link is invalid or has expired. Request the export again.', 403, 'EXPORT_LINK_INVALID')
    let out
    try {
      out = await buildExport(r)
    } catch (err) {
      if (err instanceof ExportTooLargeError) return fail('Too many rows for one export. Choose a shorter period.', 400, 'EXPORT_TOO_LARGE')
      throw err
    }
    await writeAuditLog({
      tenantId: r.tenantId,
      actorUserId: session.sub,
      action: 'export.downloaded',
      resource: 'export',
      resourceId: r.kind,
      metadata: { kind: r.kind, from: r.from, to: r.to, rows: out.rowCount },
    })
    return new NextResponse(out.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${out.filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return handleRouteError(err)
  }
}
