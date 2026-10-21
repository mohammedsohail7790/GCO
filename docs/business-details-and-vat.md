# Official business details and the Italian VAT number

**Status (2026-10-21):** legal name (Osarunwense Cristian Idiaghe, sole proprietor) and VAT number (IT03228830307, check digit valid) are recorded. **Tax code and registered address are intentionally not recorded yet** — the tax code is personal data and the registered business address is to be confirmed with the accountant (the home address is not assumed). Nothing is published until all required fields are present.

## 1. Where the details live (one place)

`lib/config/business.ts` → `BUSINESS`. Every consumer reads from it:

| Consumer | What it shows | When |
|---|---|---|
| Website footer (`components/marketing/SiteFooter.tsx`) | `legalIdentityLine()` — legal name · registered address · P.IVA · C.F. (· REA · PEC if present) | only when **all required** details are present **and** the VAT number passes the check-digit test |
| Structured data (`lib/seo/jsonld.ts`) | `legalName` and `vatID` on the Organization | same condition |
| Printable invoice (`/admin/billing/invoice/[id]`) | issuer block; warns "do not send yet" while details are missing | always (warning when incomplete) |
| Admin billing (`missingBusinessDetails()`) | lists exactly what is still missing | always |

A partially filled identity or a mistyped VAT number is **never** published (covered by `tests/unit/billingCalc.test.ts`).

## 2. What to send me

- Exact legal name, including legal form (e.g. ditta individuale / S.r.l. / S.a.s.)
- Partita IVA (`IT` + 11 digits) and codice fiscale
- Registered address (sede legale), and REA number / Camera di Commercio if applicable
- PEC address and SDI recipient code if applicable (for electronic invoicing)
- Share capital and liquidation status **if the entity is a company** (Italian rules typically require these on company websites and business papers — confirm with your accountant which items apply to your entity type)
- Bank details for invoices (IBAN) if they should appear on invoices

## 3. After I have them (an hour of work)

1. Fill `lib/config/business.ts`; run the unit tests (the VAT checksum is verified).
2. Footer and structured data switch on by themselves.
3. Invoices stop showing the "do not send yet" warning.
4. Add to the legal pages and contract templates (see `docs/privacy-and-compliance.md` §8).
5. Rebuild and redeploy; confirm the footer on the live site.

## 4. Invoices — what is and is not built

Built: configurable pricing per client (message / ticket / hour / monthly), VAT rate and note per client (e.g. reverse-charge wording), gap-free numbering on issue, immutable line snapshots, void with reason, paid status, client invoice view, printable commercial invoice, reconciliation.

**Not built, needs your accountant:** Italian fiscal e-invoicing (fattura elettronica via SDI) — format, digital submission, retention and the correct VAT treatment per client country (domestic, EU reverse charge, extra-EU). Until that is set up, invoices from this system are **commercial invoices**; the fiscal e-invoice must be issued through the accountant or an e-invoicing provider. The `vatRatePercent` and `vatNote` fields exist so the right treatment can be recorded per client once the accountant confirms it.
