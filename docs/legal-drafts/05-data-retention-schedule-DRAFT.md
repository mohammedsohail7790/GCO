# Data-retention schedule — DRAFT (provisional, NOT configured in the platform)

The platform supports per-client retention windows (`Tenant.messageRetentionDays`, off when empty), redaction that keeps financial records, and data-subject export/erasure requests. **None of the periods below is switched on; the CEO and each client decide.**

| Data | Owner | Default period | Mechanism | Note |
|---|---|---|---|---|
| Client customer conversations | client (controller) | 30 days after close, or as the client instructs | retention job → redaction | per DPA Annex I |
| Moderation content and media links | client | same as conversations | retention/erasure blank content; decisions and counts stay | |
| Operator applicants | GCO | 6 months after decision | manual / script | longer only with consent |
| Operator earnings, invoices, usage ledgers | GCO | as tax law requires (commonly 10 years — **accountant**) | never redacted | financial records are exempt from erasure on a legal-obligation basis |
| Audit log | GCO | 12 months [confirm] | | |
| Backups | GCO | 35 days of nightly dumps rolling [confirm actual]; offsite per `docs/readiness/04-…` | | erased data survive in backups until they roll off — state this in the DPA |
| Email (Workspace) | GCO | by mailbox policy | | |

Review annually. Retention timers (`gco-retention.timer`) are written but **not installed** in production.
