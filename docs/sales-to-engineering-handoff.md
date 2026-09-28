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

- [ ] Client systems in use (Shopify, WooCommerce, CRM, helpdesk, ERP, custom)
- [ ] Integrations required (which channels/systems need to connect)
- [ ] API documentation (link or file, for every system in scope)
- [ ] Webhook documentation (link or file, where applicable)
- [ ] Authentication requirements (what method each system uses)
- [ ] Sandbox access (a test environment engineering can build/test against before touching production)
- [ ] Required permissions/scopes for each integration

## Pilot

- [ ] Pilot scope (exactly what's included, per `docs/7-day-pilot.md`)
- [ ] Success criteria (per `docs/pilot-metrics.md` - agreed with the client, not assumed)
- [ ] Desired start date

## Contacts

- [ ] Client technical contact (who engineering talks to for integration questions)
- [ ] Client escalation contact (who gets pulled in for `docs/client-incident-process.md` Sev 1/2)

## What happens if this is incomplete

Engineering flags exactly which items are missing and hands the list back to sales/discovery - it does not start building against partial information or guess at what a client "probably" wants. Every item above maps directly to a question in `docs/client-technical-discovery.md`; if discovery was run properly, this handoff should already be fully answered.
