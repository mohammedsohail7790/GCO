# Pilot Acceptance Checklist

Complete and check off every item below before a 7-day pilot begins. This is the gate between tenant provisioning and a live pilot - see also `docs/real-client-data-gate.md`.

## Channels

- [ ] Inbound messages work (a real or realistic test message reaches the queue)
- [ ] Outbound messages work (an operator reply actually delivers)
- [ ] Authentication works (webhook HMAC signature verification confirmed against the real integration secret)
- [ ] Permissions are correct (the integration/API credentials used have the minimum scope actually needed)

## Operators

- [ ] Correct users assigned to this tenant, with the correct roles
- [ ] Roles correct (MANAGER/OPERATOR/CLIENT as intended - no one over- or under-privileged)
- [ ] Escalation path tested (whatever was agreed in `docs/client-incident-process.md`/discovery actually reaches the right person)

## Data

- [ ] Tenant isolation verified for this specific tenant (not just "the mechanism works in general" - confirm this tenant's data doesn't appear for any other tenant's users)
- [ ] Customer data visibility matches what was agreed (operators see what they need, nothing more)
- [ ] Required customer/order information is actually retrievable where the pilot scope depends on it

## Reliability

- [ ] Retries behave as expected (a forced/simulated failure is retried, not silently dropped)
- [ ] Duplicate handling confirmed (the same inbound event delivered twice does not create two conversations/messages)
- [ ] Queue behavior confirmed (messages don't get stuck; the queue depth is visible via `/api/v1/admin/system-health`)
- [ ] Failure handling confirmed (a forced integration failure reaches the dead-letter path rather than being lost)

## Security

- [ ] No credentials exposed anywhere in logs, screenshots, or documentation shared with the client
- [ ] HTTPS confirmed for every client-facing URL involved
- [ ] All access requires authentication - no route the pilot depends on is accidentally public
- [ ] Tenant isolation re-confirmed (same as Data section, called out again deliberately - this is the single most important check before real data enters the system)

## Reporting

- [ ] Conversations are visible in the CRM for the right users
- [ ] Activity is recorded (history entries, audit log) for actions taken during the pilot
- [ ] The specific metrics the client asked to see (from `docs/pilot-metrics.md`) are actually available, not assumed

## Business

- [ ] Pilot scope agreed in writing
- [ ] Success criteria agreed in writing (see `docs/pilot-metrics.md` - targets are set by discovery, never invented by GCO)
- [ ] Support contact established on both sides
- [ ] Escalation contact established on both sides

**If any item above is not checked, the pilot does not start.** Fix or explicitly descope the item first.
