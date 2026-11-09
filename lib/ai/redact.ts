// Masks personal data before text leaves GCO for an AI provider (per client, Tenant.aiMaskPersonalData). Pure and deliberately
// conservative: it removes what is easy to recognise reliably, it is not a guarantee that no personal data remains (names and
// free-text addresses are not detected). Order references with letters ("ORD-4521") are kept so drafts stay useful.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g
// 8+ digits, optionally with a leading + or (, spaces, dashes or brackets between them (not dots, so "12.11.2026" stays a date): phone numbers (an unspaced card
// number also matches here; the label differs, it is masked either way).
const PHONE = /(?:\+|\(|\b)\d(?:[\s()-]*\d){7,}\b/g
// Remaining runs of 6+ digits: card, account and numeric order numbers.
const LONG_NUMBER = /\b\d{6,}\b/g

export function maskPersonalData(text: string): string {
  return text.replace(EMAIL, '[email]').replace(IBAN, '[iban]').replace(PHONE, '[phone]').replace(LONG_NUMBER, '[number]')
}
