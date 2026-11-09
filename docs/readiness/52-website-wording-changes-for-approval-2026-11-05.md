# 52 — Website wording changes for the CEO's approval (5 Nov 2026; nothing changed or published)

Scope: the public website only. Every phrase below was found in the code on 5 Nov (94 occurrences in 23 files); "every occurrence" means every page, page description and search-engine summary that carries the phrase. Publishing happens only with an approved release.

## A. 24/7 coverage (kept as a core offer, with the CEO's wording)
| # | Where | Now | Proposed |
|---|---|---|---|
| A1 | Homepage headline | "24/7 Human Conversation Operations. Built to Scale." | Unchanged |
| A2 | Homepage, line under the headline (`HERO.note`) | "Hours and languages are confirmed per project, based on staffing, before go-live." | "24/7 multilingual chat and customer support coverage available for eligible projects, subject to agreed staffing, onboarding and service requirements." |
| A3 | Capability strip (homepage) | "24/7 coverage, per project staffing" | "24/7 coverage for eligible projects" |
| A4 | Industry pages, every occurrence | "24/7 coverage available subject to project staffing" / "Extended or 24/7 coverage subject to staffing" | "24/7 coverage available for eligible projects, subject to agreed staffing, onboarding and service requirements" |
| A5 | 24/7 service page, short text | "Around-the-clock chat coverage, planned around your volume and con…" | Same text, ending "…available for eligible projects, subject to agreed staffing, onboarding and service requirements." |
| A6 | 24/7 service page, FAQ "Is 24/7 included automatically?" | "No. 24/7 coverage is available subject to project staffing…" | "No. 24/7 coverage is available for eligible projects, subject to agreed staffing, onboarding and service requirements. Before go-live we confirm the operators, shifts, backup operators and training for your project." |

## B. Pilot (free, duration and conditions agreed with each client)
| # | Where | Now | Proposed |
|---|---|---|---|
| B1 | Buttons, every occurrence | "Start Your 7-Day Free Pilot" / "Start Free Pilot" / "Start Your Free Pilot" | "Start Your Free Pilot" / "Start Free Pilot" / "Start Your Free Pilot" |
| B2 | Pilot page title and label | "Start a 7-Day Pilot", "7-day pilot" | "Start a Pilot", "Pilot" |
| B3 | Section titles | "The 7-day pilot" | "The pilot" |
| B4 | Short promises, every occurrence | "Free 7-day pilot", "Free 7-day pilot, no setup fee" | "Free pilot", "Free pilot, no setup fee" |
| B5 | Terms lines | "The 7-day pilot is free." / "No setup fee." / "No long-term commitment." | "The pilot is free." / "Its duration and conditions are agreed with you in writing before it starts." / "No setup fee for standard services and pilots; custom integrations may be priced separately." / "No long-term commitment." |
| B6 | Guides (resources), every occurrence | "GCO runs a free 7-day pilot with no setup fee and no long-term commitment" | "GCO offers a free pilot with no setup fee, with the duration and conditions agreed with you in writing, and no long-term commitment" |
| B7 | Pilot timeline steps | "Step 0 · Day 1 · Days 2–6 · Day 7 · After Day 7" | "Step 0 Discovery & feasibility · Step 1 Setup & onboarding · Step 2 Live pilot (for the agreed period) · Step 3 Performance review · Step 4 Scale" |
| B8 | Scope line | "Scoped in advance: channel(s), volume and hours are agreed before Day 1." | "Scoped in advance: channels, volume, hours and the pilot's length are agreed before it starts." |
| B9 | How-it-works page | "…through a 7-day pilot." | "…through a pilot of agreed length." |
| B10 | Final call to action | "Start a 7-day pilot and evaluate the operation…" | "Start a pilot and evaluate the operation…" |

**CEO decision 8 Nov:** keep "No setup fee" for standard services and pilots; custom integrations may be priced separately (B4 to B6 updated). 24/7 wording must make clear that availability depends on agreed staffing and operational arrangements (A2 to A6 already say so).

## C. AI (currently disabled)
| # | Where | Now | Proposed |
|---|---|---|---|
| C1 | Homepage, services, footer, search summaries, every occurrence | "…supported by an operations platform and AI-assisted workflows" | "…supported by an operations platform" |
| C2 | Homepage pillar | "AI-assisted workflows: AI drafts suggested replies for the operator to review and edit. A human always sends." | "Human-written replies: every reply is written and sent by a trained operator. AI-assisted drafting is currently disabled." |
| C3 | Capability strip | "AI-assisted workflows" | "Human-written replies" |
| C4 | Homepage platform section | "…with AI assisting the operator, and a human sending every reply." | "…with a human writing and sending every reply." |
| C5 | Platform page section | Eyebrow "AI-assisted human workflow", title "AI assists the operator. The operator replies." | Eyebrow "Human workflow", title "The operator writes every reply.", body "The platform includes optional AI-assisted drafting. It is currently disabled: every reply is written and sent by a trained operator." |
| C6 | Platform page, intro and flow | "Human judgment, AI assistance and operational infrastructure… AI assists the operator and never replaces them." / "With an AI-drafted suggestion to review when useful." | "Human judgment and operational infrastructure…" / step text removed |
| C7 | Operations flow, step 1 | "AI-assisted triage: routes the conversation and suggests…" | "Triage: the platform routes the conversation to the right queue." |
| C8 | Live chat service page | "The operator replies, with an AI-drafted suggestion to review and edit when useful" / "AI-assisted reply drafting (a human always sends)" | "The operator writes and sends the reply" / line removed |
| C9 | FAQ "Does AI answer our customers?" | "No. AI drafts suggestions for the operator to review…" | "No. Every reply is written and sent by a trained human operator. AI-assisted drafting is currently disabled." |
| C10 | Moderation FAQ | "AI-assisted workflows can support operators, but a human is responsible…" | "Moderation is performed by trained human operators; a human makes every decision." |
| C11 | About page | "AI-assisted workflows support our operators - drafting, routing…" | "Our platform supports operators with routing, timers and supervision." |
| C12 | Security page | "When AI-assisted drafting is used, conversation context is sent to…" | Kept, with "(AI-assisted drafting is currently disabled.)" added before it |
| C13 | Guides about human + AI operations | Describe the model with AI drafting "if enabled" | Add one line at the top: "At GCO, AI-assisted drafting is currently disabled; this guide describes the model in general." |

## D. Not changed
No numeric service level or uptime figure exists anywhere on the site, and the platform page already says timers are "operational monitoring, not a guaranteed service level". Languages, QA and escalation wording stay as approved in Website V2 Phase B.

## E. After approval
I apply the changes in the code (no copy is hard-coded twice, most come from `lib/content/`), check every page, and they go live only with the approved release.
