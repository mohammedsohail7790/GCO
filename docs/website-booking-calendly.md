# Public booking flow - official GCO Calendly event

**Canonical destination:** `https://calendly.com/cristianidiaghe9/30min` (the official GCO 30-minute booking event). It is the constant `GCO_BOOKING_URL` in `lib/config/scheduling.ts`; `getBookCallTarget()` returns it (external, new tab, `rel="noopener noreferrer"`, screen-reader text "opens in a new tab"). It is not read from the environment, so it cannot be redirected by configuration. GCO does not create or change the Calendly event; the site only links to it, and availability of the event is not verified by the code.

## Where it is wired
- Shared `BookCallLink` (existing): home hero, every page hero, in-page CTA blocks (services, industries, platform, how-it-works, about ...), final CTAs, and the "Talk to GCO" CTA in resource articles.
- Mobile menu "Book a Call" (existing, now external).
- **New text links** (`BookCallTextLink`): pilot page sidebar ("Prefer to talk first?"), pilot form and contact form success messages ("Want to talk sooner?"), site footer ("Book a Call"), and a "Book a Call" button next to the pilot CTA on the contact page.

## Deliberately not changed
Start Free Pilot / pilot CTAs (still `/pilot`, they lead to the qualification form), the pilot and contact forms and their CRM lead capture (no duplicate leads; no booking step replaces them), the desktop header CTA (it is the pilot CTA), Client Login, the `mailto:` fallbacks, careers, and the CRM "Book Closing Call" (hunter) feature, which keeps using `CALENDLY_SCHEDULING_URL` through the calendar provider.

## Analytics
Unchanged architecture: booking CTAs carry `data-cta="book-call"` and `data-cta-location`; the existing delegated listener emits the `book_call_click` event (location only, no personal data, no network). New locations: `pilot-page`, `pilot-success`, `contact-success`, `footer`, `contact`.

## Guards
`tests/unit/bookingWiring.test.ts` (the URL appears only in `lib/config/scheduling.ts`; no other Calendly destination in `app/`, `components/`, `lib/`), `tests/unit/websiteScheduling.test.ts` (constant, env cannot override), and `tests/e2e/17-public-website.spec.ts` (every rendered booking CTA on 13 public pages points at the official event, opens in a new tab, and pilot/other CTAs keep their destinations).

## Deployment record (2026-10-07)
Commit `7d8b035`. Web service only: image `388ade0e9020` (rollback `gco-web:pre-booking` = `68229d9a6ff7`); worker, Postgres, Redis and realtime untouched (0 restarts); no migration. Verified on production: all 27 sitemap pages return 200 and carry booking CTAs (73 in total), every one pointing exactly at `https://calendly.com/cristianidiaghe9/30min` with `target="_blank"` and `rel="noopener noreferrer"`; no other Calendly URL appears on any page; the mobile-menu CTA resolves to the same URL in a real browser; home pilot CTAs still go to `/pilot`; no console or server errors; Lead count unchanged (no leads were created). Local verification before release: unit 312, integration 81, E2E 213, `tsc`/`eslint`/`next build` clean. No Calendly booking was made. The code does not (and cannot) verify that the Calendly event itself is available.
