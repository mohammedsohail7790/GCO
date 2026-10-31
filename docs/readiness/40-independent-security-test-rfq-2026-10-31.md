# 40 — Independent security test: request for quotation and candidate list (31 Oct 2026)

The CEO asked (31 Oct) for quotations for an independent security test. **Nothing has been sent to any vendor.** Sending the request, and any purchase, needs the CEO's written approval of the vendor and the cost breakdown. This document is the request text, the scope, the selection criteria and a first candidate list taken from public listings. **Every candidate below is unverified**: accreditations and prices must be checked directly with the firm and the accreditation body before anything is relied on.

## 1. Scope to put in the request
- **Target:** GCO platform on a **staging environment with fictional data only** (never production, never real client data). Staging is built from the release candidate on a separate test server; the test window and an agreed source address are given to the tester.
- **In scope:** the web application and its API (login, sessions, optional two-step sign-in, role-based access, **client separation between tenants**, signed webhook endpoints and the integration administration, admin and billing routes, the new export service once built, public forms), security headers and TLS, and the exposed server surface of the test host.
- **Method:** grey-box with accounts for each role (administrator, manager, supervisor, operator, client, hunter) so authorisation and separation are tested thoroughly; aligned with OWASP ASVS (propose level 2 for the areas above) and the OWASP API Security Top 10.
- **Out of scope:** denial-of-service and load attacks, social engineering, physical access, third-party services (Cloudflare, Hetzner, Backblaze), production.
- **Deliverables:** written report (executive summary, findings with severity, evidence, remediation advice), a debrief call, a **retest** of fixed findings, and a short attestation letter stating exactly what was tested and when (GCO will publish only what that letter supports).
- **Timing:** testing in the first half of November if possible, after the P0 builds are on staging; retest within two weeks of fixes. Lead time is a question for each vendor.

## 2. Questions every vendor must answer in writing
1. Price: fixed or day rate, number of days, what is included (report, debrief, **retest**), VAT treatment, payment terms.
2. Accreditation and evidence: which (for example CREST, ISO 27001 for the firm, named testers' certifications), and how we can verify it.
3. Sample report with client details removed.
4. Experience with multi-tenant applications and webhook/API integrations.
5. Data handling: confidentiality undertaking, where findings and evidence are stored, deletion after the engagement, location of the testers, any sub-contractors.
6. Insurance and liability terms.
7. Earliest start date and how long until the report.
8. What they need from GCO (accounts, documentation, a contact during testing).

## 3. Selection criteria (suggested)
Verified accreditation and relevant experience; a fixed price with retest included; testers located in the EU/EEA or UK with clear confidentiality terms; start date compatible with the pilot timeline; a report GCO can describe accurately to partners. Price matters but the cheapest automated scan is **not** an independent assessment of the kind partners will expect.

## 4. Candidate list (first pass from public listings, 31 Oct; verify everything)
| Firm | Country (as listed) | Why it came up | What to check |
|---|---|---|---|
| SECNORA OÜ | listing suggests Estonia | CREST marketplace entry; web testing aligned with the CREST OVS ASVS standard, levels 1–3 | Accreditation status on CREST's directory; price; EU data handling |
| WebSec B.V. | Netherlands | Independent web-application testing across Europe, positioned for small and mid-size companies | ASVS use, accreditation, price, retest terms |
| ISGroup | Italy | Listed as an ISO 27001-certified security specialist for web, mobile, cloud and network testing | Certificate on the certification body's register; language and time zone are convenient |
| Swascan (Tinexta group) | Italy | Cloud-based testing platform aimed at small companies | Whether manual testing of tenant separation is included, not only scanning |
| Pentest People | UK | CREST-listed; web application and API testing | Post-Brexit data terms; price; availability |
| itrust (Audit & Hacking) | Luxembourg | Publishes a fixed price for an **automated** scan (about €200 for one address, per its page) and estimates about 5 days for a standard web application assessment | An automated scan alone is not enough; ask for the manual-test offer |

Sources used for this first pass: [CREST marketplace entry for SECNORA OÜ](https://marketplace.crest.org/supplier/secnora-ou/), [itrust.lu hacking services](https://itrust.lu/services/hacking), [WebSec listing](https://elioplus.com/markdown/profiles/channel-partners/216355/websec), [LRQA web application testing](https://www.lrqa.com/en-gb/web-application-penetration-testing/), and an Italian provider roundup at [deepstrike.io](https://deepstrike.io/blog/penetration-testing-companies-italy). These are marketing and aggregator pages, not verification.

## 5. Draft request (email text; to be sent by the CEO or CTO only after approval)
> Subject: Request for quotation: independent web application and API security test
>
> Global Conversation Operations is a multilingual conversation-operations company preparing its first client pilot. We would like a quotation for an independent security test of our platform, run against a staging environment with fictional data. Scope: web application and API (authentication, role-based access, separation between client tenants, signed webhook endpoints, administration and billing routes, public forms, security headers and TLS), grey-box with accounts for each role, aligned with OWASP ASVS level 2 and the OWASP API Top 10. Out of scope: denial-of-service, social engineering, production and third-party services.
>
> Please send: a fixed price (or day rate and number of days) including report, debrief and retest; your accreditations and how we can verify them; a sample report; your earliest start date and report lead time; data-handling and confidentiality terms; and the information you need from us. We expect testing in November 2026.
>
> Contact: [name, address].

## 6. Decisions needed
1. Approve sending the request to three or four of the firms above (CEO's choice of names).
2. Who signs the engagement letter and confidentiality terms (CEO).
3. Whether the pilot waits for the report (CEO decision of 31 Oct: a limited pilot before it is acceptable only if the essential controls, legal review and client requirements are satisfied).
