# 66 — Fresh full verification, and a correction of two mistakes made while running it (15 Nov 2026)

**Status:** verification only, local. No production or staging change. Written to be honest about a process error, not to hide it.

## 1. The result, once done correctly
Full suite, this session, 15 Nov, against the release branch (`claude/production-security-release-5e5488`):
- `tsc --noEmit`: clean.
- `npm test` (unit): **765 passed**, 0 failed.
- `npm run test:integration`: **236 passed**, 0 failed (including a mandatory-two-factor-login suite I hadn't seen before, `twoFactorEnforcedLogin.test.ts` — 5/5 passed).
- `npm run build`: clean.
- `npx playwright test` (E2E, AI off, full suite, real worker and realtime processes running): **309 passed, 5 skipped, 0 failed.**

This matches the known-good baseline from earlier in the release work. Nothing in the application needed changing.

## 2. Two mistakes I made while getting there, and what they actually were
I want this written down plainly rather than quietly fixed, because the first wrong reports I gave in chat this evening were wrong, and I corrected them in the conversation as I found the real cause — this is that correction on the record.

**Mistake 1 — I ran the E2E suite without the BullMQ worker or the realtime server running.** Only the Next.js dev server was up. Webhook-ingested messages are processed asynchronously by a separate worker process (`npm run worker`); without it, nothing ever gets past "queued." The result was 56 real test failures and 65 further tests whose setup depends on the same pipeline, reported as "did not run." My first read of this (from a `tail` of the log) missed the "56 failed" line entirely and I told the user the run looked merely "interrupted" — that was wrong; there were genuine failures, caused by my own incomplete local environment, not a transient glitch. Starting the worker and the realtime server (`workers/realtime-server.ts`) brought this down to 10 failures.

**Mistake 2 — the dev server that Playwright was testing against was running from the main repository checkout (`/Users/mohammedsohail/Desktop/GCO`), not this release worktree.** Three routes added in this release (`/api/v1/operators/[id]/timezone`, `/api/v1/reports/productivity`, `/api/v1/admin/billing/ticket-counts`) don't exist on the main branch, so they correctly 404'd — the server I was hitting genuinely didn't have that code. I spent real effort chasing this as if it might be a Turbopack caching bug or a routing defect before checking the running process's actual working directory with `lsof`, which showed the mismatch immediately. Once the dev server was started explicitly from the worktree directory, all three routes worked and the remaining listed failures (which depended on the same pages/routes) cleared too, except one.

**The one real, separate finding — a narrow race in the realtime pub/sub path.** `workers/realtime-server.ts` registers a new socket and does `await subscriber.subscribe(channel)` *after* the WebSocket handshake completes; a client's own `open` event can fire, and the test can proceed to send a webhook, before that subscribe call finishes. If the worker publishes the resulting event into that gap, it's lost. I reproduced this consistently when the suite was otherwise broken (two different tests, `11-realtime-security` and `20-escalation`, both realtime-delivery assertions), but it did **not** reproduce once the worker warm-up order was different in the final clean run — both passed. So this looks like a genuine, narrow window rather than a broken mechanism, not reliably triggered under normal test timing, but real. I have **not** touched `workers/realtime-server.ts` — it sits inside the realtime ticket flow, which is boundary-protected code needing explicit approval before any edit. I'm naming it here so it isn't lost, not fixing it.

## 3. Why this is being written down at all
Two honest environment mistakes, both on my side, cost real time and produced one materially wrong statement to the user in chat before I traced the actual cause. The fix for both was mechanical (start the missing processes; start the dev server from the right directory) and nothing in the release candidate's code needed to change. The one open item — the realtime subscribe-after-connect ordering — is a real, narrow finding worth a look during a future, approved pass over `workers/realtime-server.ts`, not before.
