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

## Access control
`CAREER_VIEW` and `CAREER_MANAGE` are CEO_ADMIN only (applicant personal data). Earlier the list API also allowed
MANAGER (no UI used it); that was removed. `/admin/*` is CEO-gated in middleware and every API call re-checks the role.
Audit entries contain ids and statuses only - no applicant name, email or notes.

## Endpoints
- `POST /api/v1/public/careers/apply` (public)
- `GET  /api/v1/admin/career-applications?q=&status=&page=&pageSize=` (CEO_ADMIN, `Cache-Control: no-store`)
- `PATCH /api/v1/admin/career-applications/:id` `{status, reviewNote?}` (CEO_ADMIN)

## Email notifications: NOT implemented
GCO has no outbound email provider configured, so nobody is emailed when an application arrives and applicants get no
confirmation email. Persistence does not depend on email. The dashboard card on `/admin` shows the count of NEW
applications instead. Adding notifications needs a provider decision (see docs/gco-credential-remediation.md, which
reaches the same conclusion for password reset).

## Migration
`20261009054744_career_application_review` is additive (new enum, new columns with defaults, one index, and a backfill
`lastSubmittedAt = createdAt`). Existing rows become status NEW. Rollback: the new columns are unused by the old code,
so retagging the previous web image is sufficient; the columns can stay.
