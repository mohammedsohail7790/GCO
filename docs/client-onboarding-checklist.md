# GCO Client Onboarding Checklist

The repeatable process for taking a prospect from first conversation to a running pilot. Each stage below links to its own detailed document where one exists.

## Pre-sales

1. Business requirements (what problem is the client trying to solve)
2. Support channels the client needs covered
3. Expected message volume
4. Operating hours (24/7, business hours, specific timezone coverage)
5. Languages required
6. Countries/regions served
7. Operator requirements (headcount, specialization)
8. Escalation requirements (what must reach the client directly vs. handled by GCO)
9. Reporting requirements (what the client needs to see, how often)
10. SLA expectations (response time, resolution time - captured, not promised yet)

Use `docs/client-technical-discovery.md` as the live discovery questionnaire during this stage.

## Technical discovery

1. Client systems in use (helpdesk, CRM, ERP, e-commerce platform)
2. APIs available for the channel(s) in scope
3. Webhook availability and documentation
4. Authentication method (API key, OAuth, HMAC, etc.)
5. Rate limits on the client's side
6. Retry requirements/expectations
7. Message formats (text, media, structured payloads)
8. Customer data fields needed for operators to do their job
9. Order/customer lookup requirements
10. Data retention requirements
11. Security/privacy requirements (data residency, compliance obligations)

Every proposed integration must go through `docs/integration-feasibility-template.md` before it is promised to the client.

## Access requirements

**Credentials must be exchanged through a secure mechanism - never requested or sent through Telegram, chat, or any other unencrypted channel.** Use a password manager's secure share, a secrets vault, or an equivalent mechanism agreed with the client. This applies to every credential: API keys, webhook secrets, OAuth tokens, sandbox access.

## Implementation

Full detail in `docs/client-tenant-provisioning.md`. Summary:

1. Create tenant
2. Configure client profile
3. Configure channels
4. Configure integration credentials
5. Configure webhook endpoints
6. Configure routing/assignment
7. Configure operators
8. Configure escalation
9. Test inbound
10. Test outbound
11. Test duplicate handling
12. Test failure/retry behavior
13. Test tenant isolation

## Pilot

Full detail in `docs/7-day-pilot-operations.md` and `docs/pilot-acceptance-checklist.md`. Summary:

1. Define scope
2. Define success metrics (`docs/pilot-metrics.md`)
3. Train operators
4. Start 7-day pilot
5. Monitor
6. Record issues
7. Review results
8. Decide continuation - based on measured results, never assumed in advance
