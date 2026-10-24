# Data Processing Agreement — DRAFT (not legally approved)

> Prefer the European Commission's official controller–processor standard clauses (Implementing Decision (EU) 2021/915) as the actual contract text; this draft maps GCO's facts onto the mandatory Art. 28(3) content so the CEO can see what must be filled. **Lawyer review required before signature.**

**Parties:** Client [NAME, ADDRESS] ("Controller") and Osarunwense Cristian Idiaghe, sole proprietor, VAT IT03228830307, [REGISTERED ADDRESS] ("Processor"/GCO).

## 1. Subject, duration, nature and purpose (Art. 28(3))
GCO provides outsourced customer-conversation handling (chat support, moderation, multilingual, 24/7, dedicated team) as described in the Services Agreement. Duration: the term of that agreement. Nature: receiving, storing, displaying to authorised human operators, replying, moderating, reporting. Types of data: names, contact data, message content, user identifiers, moderation content and, only if the Controller sends them, special categories (Art. 9) — **special-category data must be excluded unless expressly agreed in writing**. Data subjects: the Controller's customers/users and staff.

## 2. Processor obligations (Art. 28(3)(a)–(h))
a. Process only on the Controller's documented instructions (this agreement and the in-platform configuration), including for transfers; inform the Controller if an instruction appears unlawful.
b. Persons authorised to process are bound by confidentiality (draft 04).
c. Security per Art. 32 — measures in Annex II.
d. Sub-processors: general authorisation for those in Annex III; **30 days' notice** of changes with a right to object; same obligations flow down; GCO remains liable.
e. Assist the Controller with data-subject requests — the platform provides export and erasure request tools; response target [5 business days].
f. Assist with Art. 32–36 (security, breach notification, impact assessments). **Breach notice to the Controller without undue delay and within 24 hours of becoming aware** [agree].
g. Delete or return all personal data at the end of the services, at the Controller's choice, and delete existing copies unless law requires storage; backups roll off within [35] days.
h. Make available information to demonstrate compliance and allow audits (reasonable notice, once a year unless a breach occurs).

## 3. AI
No AI processes Controller data. The platform's AI master switch is disabled. Enabling any AI processing requires a written amendment and a new Annex III entry.

## 4. International transfers and location of access
Data are stored in the EU (Germany). **For the first client, as decided by the CEO on 2026-10-23: operators are located in the EU/EEA, and no person outside the EU/EEA accesses the Controller's personal data.** Access to production systems by technical staff outside the EU/EEA (currently India) to data that includes the Controller's personal data stays **closed** until the safeguards in draft 06 and `docs/readiness/18` are in place and, where required, the EU standard contractual clauses for transfers (Decision (EU) 2021/914) have been agreed and assessed with qualified legal input. Any later change is notified to the Controller as a change to this section and Annex III.

## 5. Liability and governing law — [LAWYER]

## Annex I — Description of processing (fill per client)
Categories, retention per client (platform setting `messageRetentionDays`), languages, service hours.

## Annex II — Technical and organisational measures (facts, verified in `docs/technical-security-pack/05-security-controls.md`)
Role-based access with tenant isolation at application level (no row-level database security — disclosed limitation); hashed passwords, optional two-factor; signed webhooks; rate limiting; audit log; offsite backups in a private bucket with provider-side encryption (client-side encryption of dumps is planned and must not be claimed until done); AI disabled; retention and redaction tools; breach alert routing. Not yet in place and not to be claimed: certifications (ISO 27001/SOC 2), penetration test by a third party, 24/7 paging.

## Annex III — Sub-processors
| Name | Service | Location |
|---|---|---|
| Hetzner Online GmbH | hosting | Germany |
| Backblaze, Inc. | offsite backups (private bucket; provider-side encryption; **not additionally encrypted by GCO before upload today, planned**) | EU region (verify bucket region and the provider's own EU/US group entity) |
| Cloudflare, Inc. | DNS/proxy | global edge [review transfer terms] |
| Google Ireland Ltd (Workspace) | staff email | EU |
