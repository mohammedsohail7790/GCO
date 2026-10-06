// Resources / articles. Local typed content (no CMS). Add an article by appending to ARTICLES and setting
// published: true; drafts (published: false) are never rendered, listed, or put in the sitemap.
//
// Rules for copy here (enforced by tests/unit/websiteContentGates.test.ts): no statistics, research citations,
// customer names, testimonials, response-time promises, certifications or autonomous-AI language. 24/7 is always
// "subject to project staffing". Inline links use [label](/path) and must point at real routes.

export type Block =
  | { type: 'h2'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; text: string }

export interface Article {
  slug: string
  title: string
  description: string
  category: string
  publishedAt: string // ISO date
  published: boolean
  featured?: boolean
  services: string[] // service slugs
  industries: string[] // industry slugs
  cta: { primary: string; secondary?: 'contact' }
  body: Block[]
}

export const RESOURCE_CATEGORIES = ['Chat Operations', 'Moderation', 'Coverage & Multilingual', 'Human + AI Operations', 'Outsourcing & BPO'] as const

export const ARTICLES: Article[] = [
  {
    slug: 'scale-chat-operations-without-losing-human-quality',
    title: 'How to Scale Chat Operations Without Losing Human Quality',
    description: 'Why chat volume gets hard to manage, and how supervision, escalation, staffing and operational infrastructure keep replies consistent as you grow.',
    category: 'Chat Operations',
    publishedAt: '2026-10-06',
    published: true,
    featured: true,
    services: ['live-chat-customer-support', 'dedicated-outsourced-chat-teams'],
    industries: ['saas', 'apps-digital-platforms'],
    cta: { primary: 'Start Your 7-Day Free Pilot' },
    body: [
      { type: 'p', text: 'Chat is easy to start and hard to scale. One or two people can answer every message in the early days. Then volume grows, conversations arrive at all hours, and the same question gets three different answers depending on who picks it up.' },
      { type: 'h2', text: 'Why chat volume becomes hard to manage' },
      { type: 'p', text: 'Messages do not arrive evenly. They bunch around launches, campaigns, evenings and weekends, so a team sized for the average day is overloaded on the busy ones and idle on the quiet ones. Every unanswered message also keeps a person waiting, which is why backlogs feel worse than they look on a chart.' },
      { type: 'p', text: 'The second problem is invisible: nobody can see the whole queue. Without a shared view of who is handling what, work gets duplicated, dropped or answered late.' },
      { type: 'h2', text: 'Workload is a staffing problem and a visibility problem' },
      { type: 'ul', items: ['Operators need a bounded workload, so a single person is never holding more conversations than they can handle well', 'Assignment needs a rule, not a free-for-all, so two people do not pick up the same conversation', 'A response deadline per conversation shows what is about to go stale', 'Work should move to another operator when a deadline passes, instead of waiting for someone to notice'] },
      { type: 'p', text: 'This is the operational layer behind the people. It is what the [GCO platform](/platform) provides: queues, assignment, response timers, reassignment and workload visibility for supervisors.' },
      { type: 'h2', text: 'Supervision keeps responses consistent' },
      { type: 'p', text: 'Quality does not hold itself. Consistency comes from written guidelines, from a team lead who reviews conversations against them, and from feedback that reaches operators quickly. Supervision and QA is a working routine, not a department: someone watches the queue, reads a sample of conversations, and corrects drift early.' },
      { type: 'h2', text: 'Escalation is part of the design' },
      { type: 'p', text: 'Some conversations should not be resolved by the person who first picked them up: a decision outside their authority, a sensitive situation, a request that needs client approval. A defined path matters more than good intentions. At GCO that path runs from the operator to a supervisor or team lead and, when a decision belongs to the client, to GCO management and the client contact.' },
      { type: 'h2', text: 'Where AI fits' },
      { type: 'p', text: 'AI can help operators work faster and more consistently, for example by drafting a suggested reply. In the GCO model the human operator reviews the draft, edits it and sends it. AI assists the operator; it does not take over the conversation. See [how the human and AI model works](/resources/how-a-human-ai-conversation-operations-model-works).' },
      { type: 'h2', text: 'When outsourcing makes sense' },
      { type: 'p', text: 'Building all of this in-house means hiring, training, scheduling and managing a team, plus the tooling to run it. Outsourcing makes sense when chat is important to your business but running a conversation operation is not what you want your own managers spending time on. Read [when to outsource chat support or moderation](/resources/when-should-a-company-outsource-chat-support-or-moderation) for the signals to look for.' },
      { type: 'h2', text: 'A practical checklist' },
      { type: 'p', text: 'Before you scale, check that you can answer these questions:' },
      { type: 'ul', items: ["Can a supervisor see every open conversation and who holds it?", "Is there a written standard for tone, and a routine for reviewing it?", "What happens to a conversation when its deadline passes?", "Who decides what must be escalated, and to whom?", "Which hours and languages do you really need covered?"] },
      { type: 'callout', text: 'A pilot is the lowest-risk way to test this on your real conversations: GCO runs a free 7-day pilot with no setup fee and no long-term commitment, scoped with you in advance.' },
    ],
  },
  {
    slug: 'human-moderation-vs-automated-moderation',
    title: 'Human Moderation vs. Automated Moderation: Where Each Works Best',
    description: 'Automated filters and human moderators solve different problems. Where each works, where it fails, and why hybrid workflows keep a human in charge of judgement.',
    category: 'Moderation',
    publishedAt: '2026-10-06',
    published: true,
    services: ['chat-moderation', 'community-moderation'],
    industries: ['dating-social', 'online-communities'],
    cta: { primary: 'Start Your 7-Day Free Pilot', secondary: 'contact' },
    body: [
      { type: 'p', text: 'Moderation is often framed as a choice between software and people. In practice the question is which decisions can safely be made by rules, and which need a person who understands the situation.' },
      { type: 'h2', text: 'What automated filtering does well' },
      { type: 'ul', items: ['Catching clear, repeatable patterns at volume, such as known abusive terms or obvious spam', 'Working at any hour without fatigue', 'Applying the same rule the same way every time', 'Surfacing items for a person to look at first'] },
      { type: 'p', text: 'Used this way, automation is a very good sorter. It reduces the amount of material a person has to read.' },
      { type: 'h2', text: 'Where it struggles: context and edge cases' },
      { type: 'p', text: 'Rules read words, not situations. The same sentence can be harmless banter between friends and harassment between strangers. Sarcasm, slang, reclaimed language, a different language, and a conversation that turns slowly over many messages are all cases where a rule either misses the problem or flags something harmless.' },
      { type: 'p', text: 'Edge cases are where moderation quality is actually decided, because they are the cases users remember and the cases that carry the most risk for the people involved.' },
      { type: 'h2', text: 'What human judgement adds' },
      { type: 'ul', items: ['Reading the whole conversation, not a single message', 'Weighing intent, tone and the relationship between the people involved', 'Applying a policy with proportion rather than mechanically', 'Recognising when a situation is more serious than the rule suggests'] },
      { type: 'h2', text: 'Escalation and safety' },
      { type: 'p', text: 'Some situations should never be closed by a first-line moderator or by a rule. They need a defined path to a supervisor and, where it applies, to the client. A moderation operation is only as safe as its escalation route, which should be written down and exercised, not improvised.' },
      { type: 'h2', text: 'Hybrid workflows: automation assists, people decide' },
      { type: 'p', text: 'The workable model is hybrid. Automation sorts and surfaces; trained moderators review against your guidelines and make the call; supervisors review decisions and calibrate with you. In the GCO operating model, automation can assist a moderator but does not take the decision away from a human.' },
      { type: 'p', text: 'This is how [chat moderation](/services/chat-moderation) and [community moderation](/services/community-moderation) are run, supported by the [operations platform](/platform) that records who decided what. It is especially relevant for [dating and social platforms](/industries/dating-social) and [online communities](/industries/online-communities), where context matters most.' },
      { type: 'h2', text: 'Questions to ask about any moderation setup' },
      { type: 'p', text: 'Whether you build it yourself or work with a partner, ask:' },
      { type: 'ul', items: ["Which decisions are made by rules, and which by a person?", "How are ambiguous cases handled, and how quickly do they reach a human?", "Who reviews moderator decisions, and how often?", "What is the escalation route for a serious or sensitive case?", "Is there a record of why a decision was made?"] },
      { type: 'callout', text: 'The fastest way to see whether this fits your platform is to moderate a slice of your real conversations under your guidelines. GCO offers a free 7-day pilot with no setup fee and no long-term commitment.' },
    ],
  },
  {
    slug: 'what-it-takes-to-run-chat-coverage-24-7',
    title: '24/7 Chat Coverage: What Businesses Actually Need to Operate Around the Clock',
    description: 'Round-the-clock chat coverage is a staffing and supervision question, not a switch. What shifts, handoffs, escalation and language needs to plan for.',
    category: 'Coverage & Multilingual',
    publishedAt: '2026-10-06',
    published: true,
    services: ['24-7-chat-coverage', 'multilingual-chat-operations'],
    industries: ['dating-social', 'apps-digital-platforms'],
    cta: { primary: 'Start Your 7-Day Free Pilot' },
    body: [
      { type: 'p', text: 'Many businesses want chat coverage around the clock, but few start from what that really requires. Being available at three in the morning is not a feature you turn on. It is a team, a schedule and a way of working that has to keep functioning when your own office is closed.' },
      { type: 'p', text: '24/7 coverage is available subject to project staffing requirements. It is something to plan for each project, not something that applies automatically.' },
      { type: 'h2', text: 'Start from when conversations actually arrive' },
      { type: 'p', text: 'Not every hour carries the same demand. Map when messages come in: by day, by time zone, around campaigns and weekends. Coverage plans built on that pattern put people where the conversations are, instead of staffing every hour equally.' },
      { type: 'h2', text: 'Shifts and staffing' },
      { type: 'ul', items: ['Shifts need enough operators that the queue is handled even when someone is unavailable', 'Quiet hours still need a person who can act, not only a monitor', 'Staffing for each language you offer has to be planned separately', 'Peak and off-peak needs change over time and should be reviewed with you'] },
      { type: 'h2', text: 'Supervision across every shift' },
      { type: 'p', text: 'Quality and escalation should work the same at night as during the day. That means team leads covering the shifts, not only the daytime. Without that, the night shift quietly develops its own habits.' },
      { type: 'h2', text: 'Handoffs between shifts' },
      { type: 'p', text: 'Conversations do not end when a shift does. A handoff needs conversation history, notes on anything pending, and clarity about who owns each open item. Poor handoffs are one of the most common reasons coverage feels worse than the schedule suggests.' },
      { type: 'h2', text: 'Escalation outside business hours' },
      { type: 'p', text: 'An escalation path that only works during office hours is not a 24/7 path. Decide in advance what must be escalated, to whom, and what the operator does while waiting for a decision. The same path applies at any hour: operator, supervisor or team lead, then management and the client contact when a decision is needed.' },
      { type: 'h2', text: 'Multilingual requirements' },
      { type: 'p', text: 'Language multiplies the staffing question. GCO operates in English, Italian, French, German, Spanish and Swedish, with staffing confirmed per project before go-live. A plan that covers every hour in one language is a different project from one that covers some hours in several.' },
      { type: 'h2', text: 'Operational continuity' },
      { type: 'p', text: 'Continuity depends on tools as much as people: a platform that keeps the queue, assignments and response timers visible, so a supervisor can see the state of the operation at any time. See [24/7 chat coverage](/services/24-7-chat-coverage), [multilingual chat operations](/services/multilingual-chat-operations) and the [platform](/platform).' },
      { type: 'h2', text: 'A practical planning checklist' },
      { type: 'p', text: 'To scope round-the-clock coverage, work through:' },
      { type: 'ul', items: ["When do conversations arrive, by day and time zone?", "Which languages are needed in which hours?", "Who supervises each shift?", "How are conversations handed over between shifts?", "Who can make a decision at night, and how are they reached?"] },
      { type: 'callout', text: 'A sensible way to start is a pilot on the hours that matter most. GCO offers a free 7-day pilot with no setup fee and no long-term commitment; coverage hours and languages are confirmed for your project before it starts.' },
    ],
  },
  {
    slug: 'how-a-human-ai-conversation-operations-model-works',
    title: 'How a Human + AI Conversation Operations Model Works',
    description: 'How operators, AI-assisted drafting, human review, supervision and escalation fit together, and why the human operator stays responsible for every reply.',
    category: 'Human + AI Operations',
    publishedAt: '2026-10-06',
    published: true,
    services: ['live-chat-customer-support', 'dedicated-outsourced-chat-teams'],
    industries: ['saas', 'ecommerce'],
    cta: { primary: 'Start Your 7-Day Free Pilot' },
    body: [
      { type: 'p', text: 'Combining people and AI in a conversation operation is easy to describe badly. Either AI is oversold as something that handles customers on its own, or it is dismissed as irrelevant. The useful model is more specific: AI helps the operator, and the operator is responsible for what is sent.' },
      { type: 'h2', text: 'The roles' },
      { type: 'ul', items: ['The operator holds the conversation and decides what to say', 'AI can draft a suggested reply for the operator to consider', 'The supervisor monitors the queue and reviews conversations', 'Escalation moves a conversation to a supervisor and, when needed, to GCO management or the client', 'The platform records what happened'] },
      { type: 'h2', text: 'How a conversation moves' },
      { type: 'p', text: 'A message arrives and is queued. The platform assigns it to an available operator and starts a response timer. The operator reads the conversation. If AI drafting is enabled, a suggested reply appears alongside it. The operator reviews it, edits it or discards it, and then decides whether and what to send.' },
      { type: 'h2', text: 'What to check in any human + AI model' },
      { type: 'p', text: 'Ask any provider:' },
      { type: 'ul', items: ["Who sends the final message, a person or the AI?", "Can a supervisor see what happened in each conversation?", "What is the path when the operator cannot resolve a conversation?", "Where is the record of assignments, escalations and decisions?", "What data is sent to an AI service, and when?"] },
      { type: 'callout', text: 'The human operator remains responsible for the final response. Nothing is sent automatically by AI.' },
      { type: 'h2', text: 'Why human review is not optional' },
      { type: 'p', text: 'A draft is only a draft. AI does not know your client\'s exceptions, cannot see context outside the conversation, and can be confidently wrong. Keeping a person between the draft and the customer is what keeps responses accountable. It also means mistakes are caught by someone who can be coached and corrected.' },
      { type: 'h2', text: 'Supervision and escalation' },
      { type: 'p', text: 'Supervisors see queue size, active conversations, operator workload and response timers. When an operator cannot safely resolve a conversation, or a decision is needed from the client, they escalate with a reason and a note. The supervisor claims it, adds notes and resolves it, or escalates further. Each step is recorded.' },
      { type: 'h2', text: 'Auditability' },
      { type: 'p', text: 'Because the work runs through a platform, there is a record of who handled a conversation, when it was assigned, who escalated it and how it was resolved. That record is what makes supervision, coaching and client reporting possible. The [platform page](/platform) shows how this looks in practice, and the [security overview](/security) describes the controls around it.' },
      { type: 'h2', text: 'What this means for you' },
      { type: 'p', text: 'You get operators who work faster and more consistently, supervised by team leads, with a clear path for decisions. This is the model behind [live chat and customer support](/services/live-chat-customer-support) and [dedicated chat teams](/services/dedicated-outsourced-chat-teams).' },
      { type: 'callout', text: 'You can test the model on your own conversations. GCO offers a free 7-day pilot with no setup fee and no long-term commitment.' },
    ],
  },
  {
    slug: 'when-should-a-company-outsource-chat-support-or-moderation',
    title: 'When Should a Company Outsource Chat Support or Moderation?',
    description: 'The signs that it is time to outsource chat support or moderation: volume, coverage gaps, overloaded teams, languages, and why a pilot-first approach lowers the risk.',
    category: 'Outsourcing & BPO',
    publishedAt: '2026-10-06',
    published: true,
    services: ['dedicated-outsourced-chat-teams', 'live-chat-customer-support', 'chat-moderation'],
    industries: ['ecommerce', 'online-communities', 'saas'],
    cta: { primary: 'Start Your Free 7-Day Pilot' },
    body: [
      { type: 'p', text: 'Most companies do not decide to outsource chat in one meeting. They notice a series of problems that all point the same way. These are the signals worth paying attention to, and a way to test the decision before you commit to it.' },
      { type: 'h2', text: 'Message volume is climbing' },
      { type: 'p', text: 'When chat volume grows faster than you can hire and train, the gap shows up as slower replies and more variation between people. Adding headcount one hire at a time rarely keeps pace, and each new person needs time before they are consistent.' },
      { type: 'h2', text: 'Coverage is inconsistent' },
      { type: 'p', text: 'If conversations wait overnight or over weekends, or coverage depends on who happens to be online, you have a coverage problem. Extending your own team to cover more hours means managing shifts. Round-the-clock coverage is available subject to project staffing requirements, so it is worth discussing early.' },
      { type: 'h2', text: 'Your internal team is overloaded' },
      { type: 'p', text: 'When product, support or community managers spend their days answering chat, their real work slips. Outsourcing the conversation layer lets your team focus on the issues that genuinely need them, with a path for the operation to escalate to you.' },
      { type: 'h2', text: 'You need more languages' },
      { type: 'p', text: 'Serving customers in their own language is hard to staff in-house, especially when demand is uneven. GCO works in English, Italian, French, German, Spanish and Swedish, with staffing confirmed per project before go-live.' },
      { type: 'h2', text: 'Moderation workload is growing' },
      { type: 'p', text: 'Moderation is repetitive, sometimes uncomfortable work that benefits from a trained, supervised team and a clear escalation route. If moderation is falling on a few overloaded people, that is a signal.' },
      { type: 'h2', text: 'You want a dedicated team, not a pool' },
      { type: 'p', text: 'Some operations need operators who know your product, tone and policies. A dedicated or outsourced team is trained against your operation, supervised by team leads and managed on a platform that gives you visibility. See [dedicated and outsourced chat teams](/services/dedicated-outsourced-chat-teams).' },
      { type: 'h2', text: 'Test the decision with a pilot first' },
      { type: 'p', text: 'You do not have to commit to find out whether it works. A pilot-first approach scopes a small, real slice of your operation, runs it for a short period under supervision, and reviews the results together at the end. The steps are described in [how it works](/how-it-works).' },
      { type: 'p', text: 'Relevant starting points include [live chat and customer support](/services/live-chat-customer-support), [chat moderation](/services/chat-moderation), and the industries where this is common, such as [e-commerce](/industries/ecommerce), [online communities](/industries/online-communities) and [SaaS](/industries/saas).' },
      { type: 'h2', text: 'A quick self-check' },
      { type: 'p', text: 'If several of these are true, it is worth testing an outsourced operation:' },
      { type: 'ul', items: ["Chat volume has outgrown the team that handles it", "Replies slow down or vary at busy times or outside office hours", "Managers are answering chat instead of doing their own work", "You need languages or hours you cannot staff yourself", "You want visibility and supervision, not just extra people"] },
      { type: 'callout', text: 'GCO runs a free 7-day pilot with no setup fee and no long-term commitment. After the pilot, you decide whether to continue, under agreed commercial terms.' },
    ],
  },
]

export const publishedArticles = () => ARTICLES.filter((a) => a.published).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
export const getArticle = (slug: string) => publishedArticles().find((a) => a.slug === slug)

export function articleWordCount(a: Article): number {
  return a.body
    .map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text))
    .join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .split(/\s+/)
    .filter(Boolean).length
}
/** ~220 words per minute, rounded up, never below 1. */
export const readingMinutes = (a: Article) => Math.max(1, Math.ceil(articleWordCount(a) / 220))

export const articlesForService = (slug: string) => publishedArticles().filter((a) => a.services.includes(slug))
export const articlesForIndustry = (slug: string) => publishedArticles().filter((a) => a.industries.includes(slug))
export const relatedArticles = (a: Article, limit = 2) =>
  publishedArticles().filter((x) => x.slug !== a.slug).sort((x, y) => Number(y.category === a.category) - Number(x.category === a.category)).slice(0, limit)

export const formatDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
