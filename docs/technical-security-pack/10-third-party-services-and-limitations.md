# 10 — Third-party services, dependencies and limitations

## Services
| Service | Use | Class | Data it touches | Owner | Cost known? |
|---|---|---|---|---|---|
| Hetzner Cloud (Nuremberg) | server | **Confirmed active** (documented) | all application data | CEO account | no |
| Cloudflare (Free) | DNS, proxy, edge TLS | Confirmed active | traffic metadata, edge TLS termination | CEO | free plan |
| Backblaze B2 | offsite DB dumps | Confirmed active (documented 2026-10-04) | database dumps (all data, incl. integration secrets) | CEO | usage-priced, tiny |
| Zoho Mail EU (Free) | company email | Confirmed active | email | CEO | free |
| Calendly | public booking link | Confirmed (external link) | visitor booking details | CEO | unknown |
| UptimeRobot | uptime monitor | **Configured but unverified** | public URLs only | CEO | unknown |
| GitHub (personal account) | source, CI | Confirmed | source code | CTO's personal account | unknown |
| SMTP provider | notification email | **Optional, off** | notification titles | — | none yet |
| Google Workspace | founder email | **Planned** (plan only) | email | CEO | unknown |
| AI provider (OpenAI) | — | **Planned/optional; disabled** | none | — | €0 |
| Error tracking (Sentry etc.) | — | **Planned** | — | — | — |
| Client platforms | integrations | **Planned (none connected)** | per client | clients | — |

## Open-source dependencies and licences
~160 production packages. Licences found in `package-lock.json`: MIT (99), Apache-2.0 (~33 incl. combinations), ISC (3), BSD-2/3 (3), 0BSD, MIT-0, CC-BY-4.0, and **LGPL-3.0-or-later (≈14 entries including combined expressions)** — native image-processing libraries pulled in by the image pipeline, used server-side and **not redistributed**. A legal adviser should confirm obligations if the software is ever distributed. Dependencies are audited with `npm audit` (0 production vulnerabilities on 2026-10-20); no licence-scanning service was run. Notable runtime libraries: Next.js, React, Prisma, BullMQ/ioredis, ws, pino, zod, bcryptjs, nodemailer (optional channel).

## Operational dependencies
One server and one Redis/PostgreSQL instance each; the CEO owns most accounts; the CTO operates them. Domain registrar and renewal date not documented.

## Known limitations (summary — full list in 11)
No real client integration; no Docker/CI/production verification from this audit; recovery point up to ~24 h; single-server availability; application-layer tenant isolation only; no external penetration test; legal documents not written; retention not activated; SDI e-invoicing not built; moderation verdicts not returned to client platforms; email/SMS/paging channels need provider accounts.
