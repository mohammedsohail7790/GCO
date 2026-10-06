import { z } from 'zod'

// GCO's financial model is EUR-only, in integer minor units (cents). This makes that explicit instead of
// accepting any positive number: amounts are bounded, and a currency, if supplied, must be EUR.
// (No multi-currency support exists; adding one needs a schema change - see docs/gco-phase-e-client-onboarding.md.)
export const CURRENCY = 'EUR' as const
/** EUR 1,000,000 - a sanity ceiling against typos (an extra zero), not a business limit. */
export const MAX_PAYMENT_EUR_CENTS = 100_000_000

export const paymentAmountSchema = z
  .number({ invalid_type_error: 'amountEurCents must be a number' })
  .int('amountEurCents must be a whole number of cents')
  .positive('amountEurCents must be greater than 0')
  .max(MAX_PAYMENT_EUR_CENTS, `amountEurCents must not exceed ${MAX_PAYMENT_EUR_CENTS} (EUR 1,000,000)`)

/** Optional for backward compatibility (omitted = EUR); anything other than EUR is rejected, never silently accepted. */
export const currencySchema = z.literal(CURRENCY, { errorMap: () => ({ message: 'Only EUR is supported' }) }).optional()
