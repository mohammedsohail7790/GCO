# Website V2 - Phase C: Resources, SEO, analytics, trust, conversion

Status: implemented and verified locally (unit, integration, API-level E2E, production build, real-browser QA). See section G for deployment.

## A. Resources
- `/resources` (index, featured article + grid) and `/resources/[slug]` (statically generated, `dynamicParams = false`, unknown slug -> 404).
- Content is local, typed TypeScript in `lib/content/resources.ts` - no CMS. An article has `published`; drafts are never listed, related, sitemapped or routed.
- Each article: own title/description/canonical/OG (type `article`), Article + BreadcrumbList JSON-LD, related services and industries, a pilot CTA (+ optional Book a Call -> `/contact`), and more resources.
- Published articles (all 2026-10-06, ~3 min read, no statistics, customers or guarantees):
  1. How to Scale Chat Operations Without Losing Human Quality
  2. Human Moderation vs. Automated Moderation: Where Each Works Best
  3. 24/7 Chat Coverage: What Businesses Actually Need to Operate Around the Clock (24/7 only "subject to project staffing requirements")
  4. How a Human + AI Conversation Operations Model Works (the human operator is responsible; nothing is sent automatically by AI)
  5. When Should a Company Outsource Chat Support or Moderation?
- Adding an article: append to `ARTICLES`, set `published: true`. Tests enforce unique slug/title/description, real service/industry slugs, resolvable inline links and the forbidden-claims list.

## B. SEO
- `pageMetadata()` now sets canonical, Open Graph (shared 1200x630 image), `summary_large_image` Twitter card, and article type/time.
- Fixed: the homepage rendered no `<title>` (an `undefined` title); it now uses an absolute title.
- Real icons: `app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png` (file conventions replace the inline data-URI icon).
- Sitemap: `sitemapEntries()` (testable) lists every public page including `/resources`, published articles and `/security`; drafts excluded. `robots.txt` still blocks only private app areas.
- Structured data (`lib/seo/jsonld.ts`, server-rendered, `<` escaped): Organization + WebSite (home), BreadcrumbList (services, industries, resources, articles, security), Article (articles only). Verified information only: name, URL, `founder@globalconversationoperations.com`. No ratings, reviews, address, phone, social profiles, logo or employee counts.
- Internal linking: nav + footer include Resources/Security; services/industries pages list related guides; platform links to Security and the human + AI article; homepage teases three guides; About links onward.
- Audit result: 27/27 sitemap pages - 200, single description, canonical equal to sitemap URL, OG + Twitter, one H1, no duplicate titles/descriptions, no stray `noindex`.
- Note: the longest article titles (e.g. the 24/7 guide) exceed ~60 characters and may be truncated in results.

## C. Analytics
- No analytics provider exists in the codebase and none was installed or chosen. Added a provider-neutral layer (`lib/analytics/events.ts`): events are dispatched as `CustomEvent('gco:analytics')` and forwarded to an optional `window.gcoAnalytics.track(event)`. **No network requests are made.**
- Events: `page_view`, `pilot_cta_click`, `pilot_form_started`, `pilot_form_submitted`, `pilot_form_error`, `contact_form_started`, `contact_form_submitted`, `book_call_click`, `service_view`, `industry_view`, `platform_view`, `resource_view`, `resource_cta_click`.
- Privacy: properties are an allow-list (`path`, `location`, `slug`, `category`, `error_type`) and each value must be a short token (no spaces, `@`, `?`, `=`, `:`, `&`). Emails, phones, names, company, website, messages, lead/CRM data cannot be sent. Form events carry no form content; errors carry only `validation|rate_limited|server`.
- Loads after render, never blocks, and never throws.
- To connect a provider later (after a consent/privacy decision): add the provider script and set `window.gcoAnalytics = { track(e) { ... } }`. Cookie/consent handling is pending the legal Privacy/Cookies text.

## D. Security page
- `/security` lists only controls verified in the codebase: role-based access, tenant isolation, TLS transport, audit logging, HMAC-signed webhooks, rate limiting, backups, monitoring, operational data handling. Ends with: "Additional security and data-handling requirements can be reviewed during onboarding."
- Not claimed (guarded by tests): SOC 2, ISO 27001, PCI, HIPAA, GDPR certification/compliance, encryption at rest, MFA, penetration testing, uptime/SLAs, guarantees.

## E. Conversion
- Pilot CTA and Book a Call links carry `data-cta` / `data-cta-location`; Book a Call resolves to `/contact` until a valid Calendly URL is configured. Every article ends with a pilot CTA. Legal pages remain pending (not invented).

## F. Tests
- Unit 215 (was 167) - resources content/claims, JSON-LD, metadata, sitemap/robots, analytics taxonomy + no-PII + no-network, security claims, nav gates.
- Integration 17 (unchanged). API-level E2E 155 (was 142; +13 in `22-resources-seo.spec.ts`, spec 17 extended).
- `tsc`, `eslint`, `next build` clean. Browser QA: no horizontal overflow at 375/768/1024/1440 on the checked pages; nav fits on one row at 1024 with eight items.

## G. Deployment
Web container only; no migrations. See the deployment record appended below after release.

## H. Remaining business inputs
1. Calendly scheduling URL (`CALENDLY_SCHEDULING_URL`).
2. Legally approved Privacy Policy, Terms and Cookie Policy text.
