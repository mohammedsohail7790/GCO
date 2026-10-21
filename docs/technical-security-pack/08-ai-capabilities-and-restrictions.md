# 08 — AI capabilities and restrictions

## State: **AI is DISABLED** (CEO direction)

No AI-generated content is produced, stored, shown to operators or sent to clients, and no AI provider is called, in any environment, unless a deliberate, documented activation is performed.

## What exists in the repository (and what it does while disabled)
| Code | Purpose | While disabled |
|---|---|---|
| `lib/ai/provider.ts`, `providers/mock.ts`, `providers/openai.ts` | provider abstraction; deterministic mock; OpenAI client | `getAiProvider()` throws `AiDisabledError` on every call; the OpenAI client is never constructed |
| `lib/ai/service.ts`, worker `aiSuggestion`, `memoryExtraction` | suggestion and "memory" extraction pipeline | not enqueued; a job already in the queue returns without calling anything; no rows are written |
| Operator workspace AI panel | shows a suggestion if one exists | nothing to show; suggestion endpoint returns `generation: null` |
| Per-client AI mode (`HUMAN_ONLY` / `AI_ASSISTED`; `AI_PLUS_HUMAN` refused) | per-client policy for when AI is later enabled | irrelevant while the master switch is off; even with AI enabled, a `HUMAN_ONLY` client gets **no generation, no stored suggestion and no memory extraction** (not merely hidden) — tested (`aiDisabled`, acceptance test step 11) |

## Controls that keep it off
1. **Master switch** `AI_MASTER_SWITCH` — only the exact value `enabled` turns anything on (`true`, `1`, `yes`, other cases, typos, unset: all off).
2. **Second approval** for an external provider: `AI_PROVIDER=openai` is ignored unless `AI_EXTERNAL_PROVIDER_APPROVED=yes` **as well**; a key alone does nothing.
3. **Deployment files pin it off:** `docker-compose.yml` (web, worker, realtime) and `docker-compose.staging.yml` set `AI_MASTER_SWITCH: disabled` in the committed file, which overrides `.env`, so a missing or edited environment value, a restart or a redeploy cannot enable it; enabling needs a reviewed change to those files.
4. **Feature flags cannot enable it:** `FEATURE_AI_*` are subordinate to the master switch.
5. **Visible state:** `GET /api/v1/health` reports `ai: {enabled, mode}` (no keys).
6. **Tested:** unit (`aiMasterSwitch`, 10 cases), integration (`aiDisabled`, 4), end-to-end on an AI-off stack (`52-ai-disabled`, 3: no generation rows, no suggestion, human-only send/delivery/usage still work), and the full end-to-end suite on an AI-off stack passed (286) except the two specs that test AI features themselves (01 and 08). No live AI call was made in any test.
7. Tests that exercise the **mock** provider opt in explicitly (`AI_MASTER_SWITCH=enabled` in CI/test configuration only).

**Not verified / residual:** a production OpenAI key may exist on the server (`scripts/setup-openai-key.sh` exists); the owner should confirm and remove it if unused. Server environment was not inspected.

## Required before any activation (all of these, in writing)
Security review of the AI code and prompts; privacy assessment (data categories sent, lawful basis, client consent, sub-processor terms, regions, no-training/zero-retention terms); documented data handling and redaction; tenant-isolation tests for context building (partly existing); per-client enablement and a spend cap with alerts; evaluation of quality and failure modes on synthetic data; human oversight (operators review and send; no auto-send — the platform's design already forbids AI sending); failure handling (outages never block operators — existing); explicit approval by the CEO; then the two environment changes, in staging first.

Not in scope and **not built**: autonomous AI conversations ("AI + Human" mode).
