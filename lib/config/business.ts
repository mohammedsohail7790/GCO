// Single source for GCO's official business details (website footer, invoices, contracts, legal pages).
// Values stay null until the founder supplies the CONFIRMED registration details - nothing here is guessed.
// To go live: fill the fields below (and re-run the tests); every consumer reads from this object.
export interface BusinessDetails {
  tradingName: string
  legalName: string | null // exact name as registered, with legal form
  vatNumber: string | null // Italian "Partita IVA", e.g. IT + 11 digits
  taxCode: string | null // Codice fiscale
  registeredAddress: string | null
  reaNumber: string | null // Camera di Commercio REA, if applicable
  pecEmail: string | null // certified email, if applicable
  sdiCode: string | null // SDI recipient code for e-invoicing, if applicable
  country: 'IT'
  invoiceEmail: string
}

export const BUSINESS: BusinessDetails = {
  tradingName: 'Global Conversation Operations',
  legalName: null,
  vatNumber: null,
  taxCode: null,
  registeredAddress: null,
  reaNumber: null,
  pecEmail: null,
  sdiCode: null,
  country: 'IT',
  invoiceEmail: 'founder@globalconversationoperations.com',
}

/** What is still missing before a document may carry the business identity (invoices, contracts, legal pages). */
export function missingBusinessDetails(b: BusinessDetails = BUSINESS): string[] {
  const required: [keyof BusinessDetails, string][] = [['legalName', 'legal name'], ['vatNumber', 'VAT number (Partita IVA)'], ['taxCode', 'tax code'], ['registeredAddress', 'registered address']]
  return required.filter(([k]) => !b[k]).map(([, label]) => label)
}

/** Italian VAT numbers: "IT" + 11 digits, with the standard Luhn-style check digit. */
export function isValidItalianVat(v: string): boolean {
  const m = /^IT(\d{11})$/.exec(v.replace(/\s/g, ''))
  if (!m) return false
  const d = m[1]!.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 10; i++) {
    if (i % 2 === 0) sum += d[i]!
    else { const x = d[i]! * 2; sum += x > 9 ? x - 9 : x }
  }
  return (10 - (sum % 10)) % 10 === d[10]
}
