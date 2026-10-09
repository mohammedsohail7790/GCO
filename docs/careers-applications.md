# Operator applications (public /careers form)

## Flow
Applicant -> `/careers` (`components/marketing/CareerApplicationForm.tsx`) -> `POST /api/v1/public/careers/apply`
-> zod validation (+ 20 KB body cap, 5 submissions/min/IP rate limit, honeypot field `website`)
-> `lib/careers/applications.ts#submitCareerApplication` -> PostgreSQL table `CareerApplication`
-> CEO review at `/admin/careers` (list/search/filter/status/notes) -> `AuditLog` entry per status change.

## Fields collected
fullName*, email*, phone, country, languages, message (all server-validated; limits 200/200/50/100/300/4000).

## Data model (`CareerApplication`)
status `NEW | REVIEWING | ACCEPTED | REJECTED` (default NEW), statusUpdatedAt/By, reviewNote, submissionCount,
lastSubmittedAt, createdAt. Emails are stored lower-cased.

## Behaviour
- A repeat submission from the same email (case-insensitive) while the earlier application is NEW/REVIEWING updates
  that row (`submissionCount`++, latest details kept) instead of creating a duplicate. After ACCEPTED/REJECTED a new
  submission is a new row. The public response never returns an id and never reveals whether an email had applied.
- Database failures return a generic `500 Internal server error` (details are logged server-side, never sent to the
  applicant).

## Internal note
Optional, up to 2000 characters, CEO-only, stored in `reviewNote`. Saving the same note with the same status is a
no-op; clearing it stores null; the audit entry records only `noteChanged: true/false`, never the note text.

## Access control
`CAREER_VIEW` and `CAREER_MANAGE` are CEO_ADMIN only (applicant personal data). Earlier the list API also allowed
MANAGER (no UI used it); that was removed. `/admin/*` is CEO-gated in middleware and every API call re-checks the role.
Audit entries contain ids and statuses only - no applicant name, email or notes.

## Endpoints
- `POST /api/v1/public/careers/apply` (public)
- `GET  /api/v1/admin/career-applications?q=&status=&page=&pageSize=` (CEO_ADMIN, `Cache-Control: no-store`)
- `PATCH /api/v1/admin/career-applications/:id` `{status, reviewNote?}` (CEO_ADMIN)

## Email notifications: NOT implemented (no provider exists)
Audited 2026-10-09: no email/SMTP/transactional-mail library in `package.json`, no mail-related variable in
`.env.example`, the production `.env`, or the worker container. Nobody is emailed when an application arrives and
applicants get no confirmation. Saving an application never depends on email. The `/admin` dashboard card (count of NEW
applications) is the only alert today.

Smallest setup to add notifications (needs the owner's decision and a real account - nothing here has been created):
1. Choose a transactional provider (e.g. Resend, Postmark, Amazon SES) and verify the sending domain
   (SPF/DKIM DNS records on `globalconversationoperations.com`).
2. Put the provider API key and a `CAREERS_NOTIFY_TO` recipient in the server `.env` (never in Git).
3. Then a small change (about one file plus a worker job): after the application row is committed, enqueue a BullMQ job
   that emails `CAREERS_NOTIFY_TO` a content-light message ("new application", link to `/admin/careers`, no applicant
   details), with retries and exponential backoff; failures are logged without payloads and never affect the
   submission. The same provider also unlocks staff password reset (see docs/gco-credential-remediation.md).

## Migration
`20261009054744_career_application_review` is additive (new enum, new columns with defaults, one index, and a backfill
`lastSubmittedAt = createdAt`). Existing rows become status NEW. Rollback: the new columns are unused by the old code,
so retagging the previous web image is sufficient; the columns can stay.
