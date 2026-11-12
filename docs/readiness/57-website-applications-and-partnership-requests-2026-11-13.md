# 57 — How website applications and collaboration requests are handled today, what is missing, recommendation (13 Nov 2026)

**Scope:** the CEO's seven questions of 12–13 Nov. **Read-only:** code review of the release branch and of what production serves, plus four **count-only** queries on the production database (no names, emails or messages read). **Nothing was changed in production or in the code.**

## 1. The three public forms
| Form (page) | Endpoint | Where the submission goes | Production has it |
|---|---|---|---|
| Careers: "apply to GCO as an operator" (`/careers`) | `POST /api/v1/public/careers/apply` | Table `CareerApplication` (name, email, phone, country, languages, message) | Yes (checked 4 Nov) |
| Contact (`/contact`) | `POST /api/v1/public/contact` | CRM **lead** (source `website_contact_form`), in the sales pipeline | Yes |
| Pilot request (`/pilot`) | same endpoint, `intent: pilot` | CRM **lead** (source `website_pilot_form`) | Yes |
**There is no form for SDRs, brokers, sales representatives or business/BPO partners.** The careers form is for operators only; it has no category field and its text says "operators". A partner or broker can only write through the contact form, which creates a sales **lead** (a prospective customer record), not a partnership request.

## 2. What happens on a submission today
1. The visitor submits; the server limits the size (20 KB), **rate-limits to 5 per minute per address**, and drops submissions that fill a hidden "honeypot" field (it answers "received" without storing anything).
2. **Careers:** stored in `CareerApplication`. A repeat from the same email while the earlier one is still New/Reviewing **updates** it (and counts the repeat); after Accepted/Rejected a new submission is a new row. The response never reveals whether an email applied before.
3. **Contact/Pilot:** a CRM lead is created (unassigned); a repeat from an existing email is recorded on that lead, not duplicated.
4. **No email is sent to anyone, and no in-app alert is raised.** The code states that storing never depends on email. The platform has an email channel (used for alerts and client requests) but **it is not wired to these forms**, and the server has **no mail sender configured** (the Workspace relay is still to be approved).
5. **Who can see them:** careers applications: **Founder (CEO_ADMIN) only**, never cached (`/admin/careers`, plus a "new applications" counter on the Founder dashboard). Website leads: the Founder dashboard shows only **totals** (number of leads, pipeline value); the lead **list** is the Hunters' pool (`/hunter`, Hunter role only). **The Founder has no inbox screen for website leads.**

## 3. Answers to the seven questions
1. **Have we received any?** Production database, counted read-only on 13 Nov: **1 operator application** (submitted 8 Oct 2026, status **New**, never reviewed) and **3 website leads** (2 from the contact form on 28 Sep, 1 from the pilot form on 30 Oct). **No** SDR, broker, sales or partner applications exist (no such form). I did not read the contents; some may be test submissions from our own testing, which only reading them can tell. **To review:** sign in as Founder, `/admin/careers` for the application. The three leads can be opened from the sales pipeline views; there is no Founder list for them yet.
2. **Are the forms functional and connected?** Yes: all three work and store to the database (the counts above prove it for each). The partner/SDR/broker forms **do not exist**.
3. **Automatic email to founder@?** **No.** Nothing sends an email on submission.
4. **Name, email, category and a secure link?** **Not available.** Needs a notification built on the existing email channel. There is also **no category** on the careers form.
5. **A section to see all, filter, track status?** **Partly.** `/admin/careers` exists with search, status filter, status changes and a review note, but only for operator applications, with statuses **New, Reviewing, Accepted, Rejected** (no "Contacted" or "Interviewed"), no category, no history list, and no reply button. Website leads are not in it.
6. **Walkthrough today:** see section 4.
7. **Protection:** see section 5.

## 4. Today's walkthrough, start to finish
(1) Someone submits `/careers`. (2) It is stored; the Founder dashboard counter "new applications" goes up the next time the Founder opens it. (3) The Founder opens `/admin/careers`, searches or filters by status, reads the full submission. (4) The Founder sets a status and writes a note. (5) **To reply, the Founder copies the email address and writes from his own mailbox**; the platform has no reply function and no "contacted" step. Nothing tells him a submission arrived unless he looks.

## 5. Protection today
| Control | State |
|---|---|
| Access permission | Careers: Founder only (`CAREER_VIEW`/`CAREER_MANAGE`); no other role, including manager, can read applicants |
| Spam | Honeypot, 5 per minute per address, 20 KB limit, strict validation. **No CAPTCHA**; no disposable-email check |
| Transport | HTTPS; cookies and headers as on the Security page |
| Privacy notice on the forms | **None.** The forms carry no privacy text or consent line, and **the website has no privacy page**; the privacy notice is still an unreviewed draft (`legal-drafts/01`). This should be fixed before real applicants are encouraged to apply |
| Retention | A purge function exists (`purgeCareerApplications`: anonymises old applications) and the release adds the privacy tools screen, **but production does not have it** and **no retention period is decided or scheduled** (draft schedule `legal-drafts/05`) |
| Uploads | None (no CVs), which keeps storage and scanning out of scope |
| Audit | Status changes on applications are recorded; submissions themselves are not audited |

## 6. Recommendation (not implemented; needs the CEO's approval, and any change after the release tag needs fresh testing)
**Phase 1: small, high value (about 3 to 4 days with tests; one additive migration):**
- a **category** on the application: Operator, SDR / sales representative, Broker / referral partner, Business or BPO partner (and the existing contact form stays for prospective clients);
- statuses **New, Contacted, Interviewed, Accepted, Rejected** (and Archived), with a history of who changed what and when;
- **notification** on every submission: an in-app alert for the Founder (works at once) and an **email to founder@globalconversationoperations.com** with name, email, category and a **link that opens the submission after sign-in** (the message text is **not** put in the email, so the mailbox never carries the application itself). The email needs the Workspace relay, which is already prepared and awaiting approval;
- a **single inbox** in the Workspace (`/admin/careers` extended): all applications and partnership requests, filter by category, status, country, language and date, search, notes, a "reply" button that opens the Founder's mail program with the address and a subject filled in.
**Phase 2:** separate short forms for SDR, broker and partner (the fields differ: experience, markets, network, company); website leads shown in the same inbox for the Founder.
**Phase 3 (needs the lawyer):** privacy notice on every form with a consent line and link, a **retention period** for unsuccessful applicants run automatically, handling of access and erasure requests; **Cloudflare Turnstile** (free CAPTCHA alternative; it is a third party and must be named in the privacy notice).
**Order proposed:** first the release and the backups; Phase 1 can follow the release (or be added before it, at the cost of a new migration and a fresh test round); Phase 3's privacy notice is needed before the website actively invites applications.
