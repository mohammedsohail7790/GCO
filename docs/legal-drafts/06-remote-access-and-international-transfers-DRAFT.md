# Remote access from outside the EU/EEA (India, UAE) — DRAFT (not legally approved)

**Why it matters.** Storing data in Germany does not end the question: GDPR Chapter V treats *remote access* from a third country (viewing, administering) as a transfer. India and the UAE have no EU adequacy decision.

## Rule in force now
**No real personal data is accessed from outside the EU/EEA.** Development, testing, staging and demos use fictional data only. Production is touched only for infrastructure work that does not display client content (deploys, logs without message content) — *to be confirmed as technically true before relying on it; application logs could contain identifiers*.

## Conditions before the CTO (or any non-EU person) may access real personal data
1. DPA with each affected client signed, with the access location and role disclosed (draft 02 §4) and, where the client is a controller, its consent or non-objection.
2. A valid Chapter V mechanism between the parties: EU Standard Contractual Clauses (Decision 2021/914; module 2 controller→processor, module 3 processor→processor as applicable) **between the EU entity (GCO, Italy) and the non-EU individual/entity**, plus a documented **transfer impact assessment** (EDPB Recommendations 01/2020) covering India/UAE government-access laws. **[LAWYER]** — whether SCCs fit when the importer is an individual contractor needs professional advice.
3. Technical safeguards: access only through the platform with role limited to what the task needs; two-factor on; audit log reviewed; no download/export of personal data; no local copies; device encryption and screen lock; VPN/IP allow-list for the admin surface [not built]; no personal accounts.
4. Written, signed confidentiality (draft 04) and a security briefing.
5. Entry in the record of processing (draft 07).
6. Break-glass: time-boxed, ticketed access with the CEO's approval, recorded.

Until 1–4 exist: **gate stays closed.** This is recorded in the go-live checklist.
