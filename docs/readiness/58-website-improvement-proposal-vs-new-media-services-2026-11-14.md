# 58 — Website improvement proposal, compared with New Media Services (14 Nov 2026)

**Status:** proposal only. Nothing is published or changed. **Constraints from the CEO (13–14 Nov):** keep the headline "24/7 Human Conversation Operations" exactly; keep AI prominent but accurate; learn from New Media Services' completeness without copying its branding or design; never invent clients, statistics, offices, people, certifications or years; photographs of GCO people only with consent, stock clearly labelled and never presented as GCO staff or premises; no publication without his approval.

## 0. What was reviewed (and how)
- **GCO:** the live site (globalconversationoperations.com, viewed 14 Nov, desktop and a 375-pixel mobile width) and the site content in the repository (`lib/content/*`). **The live site is the 12 Oct version**; the wording changes approved in principle on 5–9 Nov (`52`) are not live.
- **New Media Services (newmediaservices.com.au):** its homepage and one blog page, read as text on 14 Nov. **I could not confirm whether its imagery is photography**, because I read text, not pictures: that needs the CEO's eyes or a screenshot review. **Two of its pages contained a block of unrelated online-casino links, which looks like injected spam; it is not something to learn from, and it is a reminder that our own site should be monitored for tampering.** Its figures (clients, years, projects) are its own and cannot be borrowed.
- Facts about our site: **English only; zero photographs** (the homepage has no `<img>` at all: the "operating model" picture is drawn in code); six service pages and five industry pages with a consistent structure; no overflow or layout break at mobile width; no partnership page; no privacy page.

## A. What we already do well and should preserve
1. **One clear operating model**, explained simply, with an honest escalation path (Operator, Supervisor, Management or Client Contact) and an explicit "what we do not claim" attitude. This honesty is a strength with serious buyers.
2. **Six service pages with a consistent, useful structure:** the problem, what we manage, how delivery works, the workflow, capabilities, ideal customers, how the pilot works and FAQs. They already answer most of the CEO's list (what the service is, problems solved, how operators and supervisors work, delivery, how to start). Billing structure is the missing item (see C).
3. **A claims-control system** (`lib/content/site.ts`): every sensitive claim sits behind a switch with approved wording, so nothing drifts.
4. **Platform screenshots and the "Inside GCO" page** (real Workspace, fictional data): genuine proof of capability that competitors often lack. Keep and expand.
5. **The pilot story** (discovery, setup, live, review, scale) and the **Resources guides**.
6. Mobile layout holds up; fast, light pages (no heavy media).
7. The headline, as the CEO wants.

## B. What New Media Services does better in its presentation
1. **Breadth in the navigation:** Company (About, Careers, Offices), Services (with sub-items), Case Studies, Blog, and an always-visible Contact button. We have Services, Industries, Platform, How it works, Resources, About, Careers, Contact, and no Case Studies, Partners or Blog rhythm.
2. **Human + AI as a headline idea** ("Human and AI business process outsourcing"), with a plain explanation of human-in-the-loop and five outcomes. We have the idea but bury it, and our current AI wording over-claims (see section 3).
3. **Social proof structure:** named testimonials, four headline counters, case-study links, fresh blog posts. (We have none of the content, and must not invent any; we can build the structure.)
4. **Repeated, single-purpose calls to action** ("Book a Meeting" everywhere) and a contact form with a "which service are you interested in?" dropdown and a visible consent line.
5. **Company presence:** offices with addresses, social links, a privacy policy link in the footer.
6. **Commercial model stated briefly** ("pay-per-service", seat leasing) on the homepage.
What we **should not copy:** their statistics, the novelty counter, the offices, anything that implies a scale we do not have.

## C. What GCO is missing
| # | Gap | Why it matters |
|---|---|---|
| 1 | **Human imagery** (zero photographs) | The CEO's biggest point: visitors cannot picture people handling their conversations |
| 2 | **Privacy notice and form disclosures** (no privacy page; no consent line on any form) | Legal and trust gap; urgent before we promote recruitment |
| 3 | **Legal and business identity** shown accurately (the footer block only appears when all details exist; the tax code and address are not yet recorded) | Credibility; must state the real legal status: a sole proprietorship, not a company |
| 4 | **About:** mission, founder story, vision, the people (with their consent) | Credibility; the page exists but is thin |
| 5 | **A partnership page and its own form** | No route for BPO partners, brokers, SDRs, technology partners |
| 6 | **Careers v2:** roles, languages, steps, remote work, training; separate paths | Today: one operator-only form, no categories |
| 7 | **Industries:** five today (dating and social first). The CEO wants ten, balanced: e-commerce and retail, SaaS, marketplaces, apps and platforms, gaming, communities, hospitality and tourism, education, fintech support, dating and social | Positions GCO as a generalist BPO |
| 8 | **Commercial models page/section** (volume-based, dedicated or hourly, pilot, conditions) | Today only the pilot is explained |
| 9 | **Human + AI section** that separates "live" from "in preparation" | Accuracy |
| 10 | **Social proof architecture** (testimonial, logo, case-study templates; labelled demonstration material) | Ready to fill when real results exist |
| 11 | **Six-language site** (the site names six languages but is only in English) | The recruitment path needs it first |
| 12 | **Meeting booking** visible beyond the "Book a Call" button | Conversion |
| 13 | **Reply promise:** the contact page says "Expect a reply within one business day" while **no notification exists** and the Founder only sees submissions by logging in | **Remove or soften until notifications work** |
| 14 | Pilot wording: the live site says "7-day free pilot"; the CEO's decisions of 8 and 13 Nov differ in emphasis | Needs one agreed sentence (section 3) |
| 15 | A visible **Operations process** section (client inquiry to reporting) in one picture | CEO point 19; today spread over several pages |

## D. Greatest commercial impact (in order)
1. **Never miss an inquiry** (notification and inbox): a lead you do not see is worth zero.
2. **Trust basics:** privacy notice, accurate legal block, honest reply promise.
3. **Human imagery** on the hero and the six service pages, plus a real Workspace screenshot beside it.
4. **Homepage restructure** so the value is clear in under a minute (layout below).
5. **About page** with the Founder and CTO, with consent.
6. **Partnership page** with its own workflow (commission wording only after legal review).
7. **Commercial models** and the **Human + AI** sections, stated precisely.
8. **Industries** expanded with realistic use cases.
9. **Six languages**, starting with the careers path.

## E. Assets and materials needed
- **Photography (shot list):** an operator at a computer with a headset (homepage hero); multilingual team in a professional setting; a supervisor reviewing queues and dashboards; a training or quality-review session; small team collaboration; one image per service (6) and per industry (10, reusing where sensible); careers page images; **portraits of the Founder and CTO (consent)**. Prefer **real photographs of real GCO people with signed consent**. Where none exist, **properly licensed stock**, each captioned as an illustration ("Illustrative image"), never implying they are GCO staff or that the office is ours. **Any paid stock licence needs the CEO's approval before purchase**; free-licence libraries exist but each image's licence must be checked and recorded.
- **Workspace screenshots:** fictional demo data only, regenerated from the demo copy, no real names or addresses.
- **Text from the CEO:** mission, the founder story, vision, approach to outsourcing, approved legal wording, permission for named people, any testimonial permissions later.
- **Technical:** optimised images (modern formats, responsive sizes, descriptive alternative text), a consent form template for photographed people.

## F. Quick versus larger changes
- **Quick, text only (1 to 3 days, ships with a release):** AI wording corrected and strengthened as in section 3, one pilot sentence, the reply promise, privacy link in the footer, call-to-action consistency, industries blurbs, commercial-models text.
- **Medium (1 to 2 weeks each):** homepage restructure with image slots; service-page imagery; About page; Careers v2; Partnership page with form.
- **Larger (2 to 4 weeks):** six-language site, the inbox and workflows (`59`), a case-study and testimonial system, a blog or insights routine.

## G. Priority order and effort (one engineer, estimates; content and photography supplied by the CEO are not included)
| Order | Work | Estimate | Depends on |
|---|---|---|---|
| 1 | Security-critical release, backups, monitoring (not website) | in progress | CEO approvals |
| 2 | Privacy notice and form disclosures; accurate reply promise; legal block (text and a page) | 2 to 3 days | **Lawyer's review** of the text; accountant's details |
| 3 | Inbox, notifications, categories (`59` Tier A or B) | 3 to 4 days (A) or 8 to 10 days (B) | Workspace relay approved |
| 4 | Text corrections (AI, pilot, 24/7 qualifier, commercial models) | 1 to 3 days | CEO's wording approval |
| 5 | Homepage restructure and human imagery | 1 to 2 weeks | Photos or licences approved |
| 6 | About, Careers v2, Partnership page and form | 1.5 to 2 weeks | Texts; commission wording reviewed by the lawyer |
| 7 | Industries to ten, with use cases | 1 week | CEO review of claims |
| 8 | Six languages (careers and partner paths first) | 2 to 3 weeks plus native-speaker review | Translator or reviewers |
| 9 | Case-study and testimonial templates | 3 to 5 days | Real material later |
Total website effort for all of it: roughly **8 to 12 weeks** of one engineer's time, in parallel with release work, which is why the order above matters. The first four items are the ones that protect the business.

## 1. Suggested homepage layout (where the human imagery goes)
1. **Header:** Services, Industries, Platform, How we work, Company (About, Careers, Partners), Resources, and a clear **Book a Meeting** button.
2. **Hero:** eyebrow; the headline **"24/7 Human Conversation Operations. Built to Scale."** unchanged; a revised one-sentence subline (below); primary button **Start Your Free Pilot**, secondary **Book a Call**. **Right half: a professional photograph of an operator with a headset at a computer**, with a smaller overlay card showing the **real Workspace screen** (fictional data, labelled "Illustration"). The honest qualifier line stays under it.
3. **Honest facts strip** (no logos, no numbers we cannot back): six languages; human operators with supervisors; three-step escalation; free pilot, no setup fee for standard services.
4. **Our six services:** cards, each with a small **people photograph** and a one-line benefit.
5. **Why a managed BPO instead of freelancers:** supervision, replacement and continuity, quality review, flexible capacity, one invoice and reporting. (**Image:** supervisor watching a queue.)
6. **Human operators plus our technology:** a split section, **photo of a team on the left, real Workspace screenshots on the right**, with small badges "Live now" and "In preparation".
7. **How we work:** discovery, onboarding, training, delivery, supervision, reporting (six small steps; **image:** training or quality review).
8. **Industries:** ten tiles with a use case each.
9. **Commercial flexibility:** three cards: volume-based projects (no fixed monthly fee, no setup fee, agreed unit prices, defined scope and spending limits), dedicated operators or hourly arrangements (agreed terms), the pilot (conditions below).
10. **Security and oversight:** only verified safeguards, plus a "what we do not claim" line (links to the Security page).
11. **Proof, honestly labelled:** a **sample report marked "Demonstration with synthetic data"**; placeholders for real testimonials later.
12. **About strip:** **portraits of the Founder and CTO** (with consent), two lines on why GCO exists.
13. **Closing call to action:** consult, pilot, or partner (three clear choices).
14. **Footer:** accurate legal block, privacy notice, contact, languages.

## 2. Revised AI positioning (replaces section C of `52`)
**Principle:** AI stays a visible, prominent part of the technology story, described exactly as it is: **built, tested, in controlled preparation, not enabled in live client operations**, and always with a human reviewing and sending. Never "AI-powered", never "AI answers your customers", never implied as active.
- **Hero subline (proposed):** "GCO runs chat operations for modern platforms: trained human operators, supervised by team leads, supported by an operations platform. AI-assisted drafting is built and being prepared for controlled use; every reply today is written and sent by a human operator."
- **Section "Human + AI":** AI-assisted workflows are intended to support drafting suggested replies, classification and routing, knowledge retrieval, operator productivity and consistency. **Status labels:** "Live now": human operators, queues, assignment, supervision, escalation, QA review. "In preparation": AI-assisted drafting (disabled until approved and tested). "The human operator reviews and sends every reply."
- **Security page:** keep the sentence on what happens "when AI-assisted drafting is used", with "(AI-assisted drafting is currently disabled)".
- This reverses the removals in `52` section C (C1, C3 to C11) and keeps only the corrections that make the wording accurate (C2, C9, C12, C13).

## 3. Wording that needs one decision from the CEO
1. **Pilot:** "Start Your Free Pilot. A pilot of agreed length, typically seven days, with scope and conditions agreed in writing. Acceptance depends on feasibility, security, staffing and sustainable costs." (Keeps the 7-day idea visible without promising it to everyone.)
2. **24/7:** the headline stays. Under it: "24/7 coverage is available for eligible projects, subject to agreed staffing, languages and operational requirements."
3. **Reply promise:** remove "within one business day" until the notification system runs and a person owns the inbox; then "We aim to reply within one business day."
4. **Commissions:** the partnership page must not display a commission rate until the lawyer has reviewed the wording and an agreement template exists (`59`).
5. **Legal block:** "GCO is operated by [legal name], sole proprietor (ditta individuale), VAT [number], [address]" only when the accountant confirms what must and may be shown; no wording suggesting a registered company.
