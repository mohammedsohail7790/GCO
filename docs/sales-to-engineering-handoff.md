# Sales → Engineering Handoff

**Engineering does not begin client-specific implementation work until this handoff is complete.** An incomplete handoff means discovery isn't finished yet, not that engineering should start filling gaps with assumptions.

Cristian must provide the following before implementation work starts:

## Client

- [ ] Client name
- [ ] Business model (what they sell/do)
- [ ] Support channels required
- [ ] Required languages
- [ ] Operating hours / coverage needs
- [ ] Expected message/conversation volume

## Systems

- [ ] **Provider/platform named explicitly** (not "WhatsApp" as a vague wish - which specific API/tier/account type)
- [ ] Client systems in use (Shopify, WooCommerce, CRM, helpdesk, ERP, custom)
- [ ] Integrations required (which channels/systems need to connect)
- [ ] Required workflows/capabilities (what operators actually need to do, not just which system to connect)
- [ ] API documentation (link or file, for every system in scope)
- [ ] Webhook documentation (link or file, where applicable)
- [ ] Authentication requirements (what method each system uses - see credential TYPE, never the value, in `docs/first-client-integration-discovery.md`)
- [ ] Sandbox access (a test environment engineering can build/test against before touching production)
- [ ] Required permissions/scopes for each integration
- [ ] Compliance/security requirements (data residency, PII handling, retention)

## Pilot

- [ ] Pilot scope (exactly what's included, per `docs/7-day-pilot.md`)
- [ ] Pilot duration (the standard offer is 7 days - only deviates from this with an explicit reason)
- [ ] Success criteria (per `docs/pilot-metrics.md` - agreed with the client, not assumed)
- [ ] Desired start date
- [ ] Any hard deadline (distinct from desired start date - e.g. a client-side event this must be ready before)

## Contacts

- [ ] Client technical contact (who engineering talks to for integration questions)
- [ ] Client escalation contact (who gets pulled in for `docs/client-incident-process.md` Sev 1/2)

## Secure credential transfer

No actual credential values belong in this handoff, in chat, or in any document - only credential *types* (see `docs/first-client-integration-discovery.md`'s Authentication section). **No specific secure credential-transfer mechanism (a password manager's shared vault, a secrets-sharing tool, etc.) has actually been set up for this yet.** This is a real, remaining operational gap - stated honestly rather than inventing a tool that isn't in place. Until one is chosen, real credentials must not be exchanged at all; discovery and feasibility work can proceed without them (see the earlier sections of this document), but implementation against real credentials waits for this gap to close.

## What happens if this is incomplete

Engineering flags exactly which items are missing and hands the list back to sales/discovery - it does not start building against partial information or guess at what a client "probably" wants. Every item above maps directly to a question in `docs/client-technical-discovery.md`; if discovery was run properly, this handoff should already be fully answered.
