# Inside GCO - public technology tour (`/inside-gco`)

The page shows the real GCO platform to prospective clients and partners: operator dashboard, live queue and assignment, supervisor dashboard
and escalations, quality control, language coverage, and the complete workflow, plus a ~75 s captioned video. It is linked from `/platform`
and listed in the sitemap (not in the main nav, which is pinned by a test).

## What is shown, and what is not
- Shown: screens and a recording of the real application running on an **isolated local demo copy with fictional data only** (invented people,
  companies and conversations). Nothing is from production; no credentials, system addresses or client information appear.
- **Not shown (not approved for publication):** the sales CRM / pipeline, the client panel, service settings, and the AI-suggestion text of the
  demo copy (it runs a placeholder AI provider, so that card and the pre-filled draft were hidden in the captures; the operator's own typed reply is shown).
- Claims stay inside the approved ones: language-matched routing (no translation, no language detection), quality scores only from supervisor reviews
  (no automatic scoring), AI only suggests and the operator sends, no service-level guarantees. `tests/unit/insideGco.test.ts` pins this.
- The longer (4 min) partner demo `deliverables/partner-demo/GCO_Partner_Demo.mp4` is **not published**; it is for private sharing with partners.

## How the assets were produced (reproducible, local only)
Scripts and raw captures live in `deliverables/inside-gco/` (untracked, never deployed): `prep.sh` (fictional conversations through the signed webhook),
`shoot.mjs` (screenshots via system Chrome, panels isolated with CSS, 2x), `webp.mjs` (WebP conversion), `film.mjs` (real-UI recording, sessions
pre-authenticated so no login screens appear), `conv.mjs` (WebM to H.264 MP4), `framegrab` (frame review). Re-run against a local stack seeded with
`npx tsx prisma/demo-showcase.ts --reset`. Files are in `public/inside-gco/`. Captions are WebVTT (the video has no sound track).

## Deployment record (2026-10-12, owner-instructed)
- Gate: lint/tsc clean; unit 439/439; integration 168/168; build clean; e2e 259/260 on the full run - the one failure was the new spec's own check
  (it matched the local dev URL in canonical tags), fixed; that spec and the public-website spec then passed (57/57).
- Backup `gco-postgres-20261012T074538Z.dump` (900,899 bytes), B2 upload verified (sha1 30a4c62c...). No migration (none needed).
- Commit `9bbbcca`; rollback tags `gco-web:pre-inside`, `gco-worker:pre-inside`. Only web and worker recreated.
- Post-deploy (read-only): `/inside-gco` 200 with the video and captions track; five screenshots, poster and captions served; the video answers
  range requests (206, video/mp4); `/platform` 200; sitemap lists `/inside-gco`; no demo addresses, placeholder text or localhost in the page. No production data created.
