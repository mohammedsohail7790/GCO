import { NextRequest } from 'next/server'
import { z } from 'zod'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { createLead, LeadDuplicateError } from '@/lib/crm/leads'

// Public, unauthenticated endpoint (the /contact page's form). Reuses the
// existing CRM Lead model rather than inventing a parallel "inquiry" table -
// a website inquiry IS a sales lead, and this way it lands directly in the
// same unassigned-lead pool Hunters already claim from (source: 'website').
const MAX_BODY_BYTES = 20_000 // generous for this form's fields, tight enough to reject abuse payloads

const Schema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  email: z.string().email().max(200),
  country: z.string().max(100).optional(),
  operationType: z.string().max(200).optional(),
  service: z.string().max(200).optional(),
  teamSize: z.string().max(100).optional(),
  message: z.string().max(4000).optional(),
  // Honeypot: real visitors never see or fill this field (hidden via CSS on
  // the form); a non-empty value here is a near-certain bot submission. Kept
  // permissive here (not `.max(0)`) so a filled trap doesn't itself fail
  // validation with a 400 that could tip off a bot - it's silently accepted
  // as a fake "success" below instead.
  website: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BODY_BYTES) return fail('Request too large', 413)

    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    if (await isRateLimited(`public-contact:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds)) {
      return fail('Too many submissions. Please try again later.', 429)
    }

    const body = Schema.parse(await req.json())
    if (body.website) {
      // Silently accept honeypot-triggered submissions without creating a
      // lead - never tell an automated client it was detected.
      return created({ received: true })
    }

    const notesParts = [
      body.operationType ? `Operation type: ${body.operationType}` : null,
      body.service ? `Interested in: ${body.service}` : null,
      body.teamSize ? `Approximate team requirement: ${body.teamSize}` : null,
      body.message ? `Message: ${body.message}` : null,
    ].filter(Boolean)

    try {
      await createLead({
        companyName: body.company,
        contactName: body.name,
        email: body.email,
        country: body.country,
        source: 'website_contact_form',
        notes: notesParts.join('\n') || undefined,
        actorUserId: null,
      })
    } catch (err) {
      // A duplicate email is a real, expected case here (a visitor resubmits,
      // or already has an open lead) - respond as a normal success rather
      // than surfacing an internal de-dup error to a public visitor.
      if (!(err instanceof LeadDuplicateError)) throw err
    }

    return created({ received: true })
  } catch (err) {
    return handleRouteError(err)
  }
}
