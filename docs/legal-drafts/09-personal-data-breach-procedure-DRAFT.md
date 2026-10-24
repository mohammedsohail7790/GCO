# Personal data breach procedure — DRAFT (internal, not legally approved)

**Why.** GDPR requires a processor to tell the controller **without undue delay** after becoming aware of a breach (Art. 33(2)), and a controller to notify the supervisory authority within 72 hours where required (Art. 33(1)). GCO is a controller for its own data (website leads, applicants, staff) and a processor for clients. This procedure covers both. It is a plain internal checklist; wording and deadlines for clients come from each DPA (draft 02 proposes **24 hours** to the client, to be agreed). Check the legal points with a qualified adviser.

## 1. What counts
Loss, theft, unauthorised access, disclosure, alteration or destruction of personal data, including: a leaked key or password, a lost laptop with data, a misdirected export, a backup readable by someone it should not be, a cross-tenant data exposure, or ransomware.

## 2. Roles
| Role | Person | Does |
|---|---|---|
| Incident lead | CTO [name] | contains, investigates, keeps the log |
| Decision owner | CEO | decides notifications, speaks to clients and authorities |
| Backup contact | [second person, to name] | covers absence |

## 3. Steps
1. **Detect and record** the time you became aware. Start the incident log (what, when, who, systems, data types, number of people, tenants affected).
2. **Contain:** revoke the key or session, disable the account, take the system offline if needed, preserve evidence (logs, copies of the affected state). Do not delete evidence.
3. **Assess:** is personal data involved, whose (which client/tenant), what kind (any sensitive data), likely risk to people.
4. **Client breach (GCO as processor):** tell the affected client contact **without undue delay, target within 24 hours of awareness**, by phone and email, with what is known and what is not, and keep updating.
5. **GCO's own data (GCO as controller):** the CEO decides within the same day whether the breach is likely to risk people's rights. If so, notify the Italian supervisory authority (Garante) **within 72 hours of awareness** through its online form; if the risk is high, tell the people affected. Record the decision, including a decision **not** to notify, with reasons (Art. 33(5)).
6. **Fix and review:** root cause, corrective actions, update the risk assessment and this procedure. Keep the log for at least [x years, to confirm].

## 4. Contact details (fill in)
Garante breach notification: via garanteprivacy.it [verify the current process]. Client emergency contacts: held per client in the onboarding record. GCO: founder@ and partnerships@ (Google Workspace).

## 5. Open points for qualified review
Exact notification thresholds, who is a controller vs processor for each data set, and any contractual duties beyond GDPR.
