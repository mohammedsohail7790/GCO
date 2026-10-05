import { NextRequest } from 'next/server'
import { z } from 'zod'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'
import { getClientIp } from '@/lib/api/clientIp'
import { createLead, LeadDuplicateError } from '@/lib/crm/leads'

// Public, unauthenticated endpoint (the /contact page's form). Reuses the
// existing CRM Lead model rather than inventing a parallel "inquiry" table -
// a website inquiry IS a sales lead, and this way it lands directly in the
// same unassigned-lead pool Hunters already claim from (source: 'website').
const MAX_BODY_BYTES = 20_000 // generous for this form's fields, tight enough to reject abuse payloads

const Schema = z
  .object({
    // Required for the general contact form; optional for the 7-day pilot request
    // (intent: 'pilot'), which deliberately asks for as little as possible.
    name: z.string().min(1).max(200).optional(),
    company: z.string().min(1).max(200),
    email: z.string().email().max(200),
    country: z.string().max(100).optional(),
    operationType: z.string().max(200).optional(),
    service: z.string().max(200).optional(),
    teamSize: z.string().max(100).optional(),
    message: z.string().max(4000).optional(),
    // 7-day pilot request fields (all optional). `website` below is the honeypot
    // and must keep that name - the visitor's company site is `companyWebsite`.
    intent: z.enum(['contact', 'pilot']).optional(),
    companyWebsite: z.string().max(300).optional(),
    volume: z.string().max(100).optional(),
    languages: z.string().max(200).optional(),
    coverage: z.string().max(100).optional(),
    // Honeypot: real visitors never see or fill this field (hidden via CSS on
    // the form); a non-empty value here is a near-certain bot submission. Kept
    // permissive here (not `.max(0)`) so a filled trap doesn't itself fail
    // validation with a 400 that could tip off a bot - it's silently accepted
    // as a fake "success" below instead.
    website: z.string().max(500).optional(),
  })
  .refine((v) => v.intent === 'pilot' || (v.name && v.name.length > 0), { path: ['name'], message: 'Required' })

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BODY_BYTES) return fail('Request too large', 413)

    // Real client address (Cloudflare-aware, spoof-resistant) - see lib/api/clientIp.ts.
    const ip = getClientIp(req.headers)
    if (await isRateLimited(`public-contact:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds)) {
      return fail('Too many submissions. Please try again later.', 429)
    }

    const body = Schema.parse(await req.json())
    if (body.website) {
      // Silently accept honeypot-triggered submissions without creating a
      // lead - never tell an automated client it was detected.
      return created({ received: true })
    }

    const isPilot = body.intent === 'pilot'
    const notesParts = [
      isPilot ? 'Request: 7-day pilot' : null,
      body.operationType ? `Operation type: ${body.operationType}` : null,
      body.service ? `Interested in: ${body.service}` : null,
      body.teamSize ? `Approximate team requirement: ${body.teamSize}` : null,
      body.volume ? `Approx. monthly message/conversation volume: ${body.volume}` : null,
      body.languages ? `Languages: ${body.languages}` : null,
      body.coverage ? `Coverage needed: ${body.coverage}` : null,
      body.message ? `Message: ${body.message}` : null,
    ].filter(Boolean)

    try {
      await createLead({
        companyName: body.company,
        // A pilot request has no separate contact-person field; the company name
        // stands in so the lead is never created with an empty/invented person.
        contactName: body.name ?? body.company,
        email: body.email,
        website: body.companyWebsite || undefined,
        country: body.country,
        source: isPilot ? 'website_pilot_form' : 'website_contact_form',
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
