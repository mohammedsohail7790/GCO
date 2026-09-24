import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { created, fail, handleRouteError } from '@/lib/api/response'
import { isRateLimited, RATE_LIMITS } from '@/lib/api/rateLimit'

// Public, unauthenticated endpoint (the /careers page's application form).
const MAX_BODY_BYTES = 20_000

const Schema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  languages: z.string().max(300).optional(),
  message: z.string().max(4000).optional(),
  // Honeypot - see app/api/v1/public/contact/route.ts for the same pattern
  // (permissive here so a filled trap doesn't itself fail validation).
  website: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0')
    if (contentLength > MAX_BODY_BYTES) return fail('Request too large', 413)

    const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
    if (await isRateLimited(`public-careers:${ip}`, RATE_LIMITS.PUBLIC_FORM.max, RATE_LIMITS.PUBLIC_FORM.windowSeconds)) {
      return fail('Too many submissions. Please try again later.', 429)
    }

    const body = Schema.parse(await req.json())
    if (body.website) return created({ received: true })

    const application = await db.careerApplication.create({
      data: {
        fullName: body.fullName,
        email: body.email,
        phone: body.phone,
        country: body.country,
        languages: body.languages,
        message: body.message,
      },
    })

    return created({ received: true, id: application.id })
  } catch (err) {
    return handleRouteError(err)
  }
}
