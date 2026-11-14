# 67 — Website legal block: draft text and open questions for the accountant (15 Nov 2026)

**Status:** draft for the CEO to send to his accountant. **Not legal or tax advice** — every italicized point below is a question for the accountant to confirm, not a fact I'm asserting. Nothing here is published; the footer block stays off the live site until the accountant has reviewed it and the CEO approves the final wording (per his 14 Nov decision, `58` §4 point 5).

## 1. Why this matters now
The current website shows no legal identity at all — no registered name, VAT number, or address anywhere. For a site that takes pilot and contact-form submissions and will soon take payments, this is a basic trust and compliance gap, separate from (but related to) the privacy notice already drafted in `59` §7.

## 2. Draft footer text (placeholders in brackets; nothing here is final)
> GCO — Global Conversation Operations is operated by **[legal name of the sole proprietor]**, a sole proprietorship (*ditta individuale*) registered in Italy.
> VAT number (Partita IVA): **[number]**
> Tax code (Codice Fiscale): **[number, if different from the VAT number]**
> Registered address: **[address]**
> PEC (certified email): **[address]**
> REA number: **[number, if applicable]**

Everything in brackets is currently unknown to me and must come from the CEO and his accountant — I have not seen any registration document.

## 3. Questions for the accountant (yes/no or short answers are enough)
1. **Is the wording above complete for a *ditta individuale*'s website footer**, or does Italian practice expect something different (for example, listing the business name differently from the owner's personal name, or omitting the REA number if none exists)?
2. **Is a PEC address mandatory to display**, or only used for official correspondence and not shown publicly?
3. **Does the invoice identity already set up for billing** (per `49` §C.1 — codice fiscale, address, PEC, SDI code) match what should appear on the website, or does the website block need different/fewer fields than an invoice?
4. **Any disclosure required specifically because GCO takes payment online** (e.g., terms of service link, right-of-withdrawal notice for any B2C client, dispute resolution body) that belongs in the footer alongside the legal block?
5. **Timing:** should this go live before or alongside the privacy notice (`59` §7), or does it not matter for compliance purposes?

## 4. What I need from the CEO once the accountant answers
The actual values for every bracketed field above, and the accountant's corrected wording if different from the draft. Once both are in hand, this becomes a short, static footer component — a small, low-risk change I can implement and show on staging before anything is published, following the same approval gate as every other website change (`58`, `59`).

## 5. What this does not cover
Tax regime, invoicing route, e-invoicing, or payment classification — those are already listed as open questions for the accountant in `49` §C and are unaffected by this specific footer-text question.
