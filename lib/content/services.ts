// The six approved GCO services. Do not add services here without business approval
// (no voice / call-centre support, no automation promises). Page copy is data-driven so
// the template stays shared and each service has its own substance.

export interface Faq {
  q: string
  a: string
}

export interface Service {
  slug: string
  name: string
  short: string
  metaTitle: string
  metaDescription: string
  heroLead: string
  problem: { title: string; body: string; points: string[] }
  manages: string[]
  delivery: { title: string; body: string }[]
  workflow: string[]
  capabilities: string[]
  idealFor: string[]
  pilot: string
  industries: string[] // slugs
  related: string[] // service slugs
  faqs: Faq[]
}

export const SERVICES: Service[] = [
  {
    slug: 'live-chat-customer-support',
    name: 'Live Chat / Customer Support',
    short: 'Trained operators answering your customers in real time, in your tone, on your guidelines.',
    metaTitle: 'Live Chat & Customer Support Outsourcing',
    metaDescription: 'Outsourced live chat and customer support by trained human operators, supervised by team leads and supported by an operations platform. Start with a free 7-day pilot.',
    heroLead: 'Customers expect a fast, consistent answer in chat. GCO provides trained operators who handle your support conversations day to day, so volume growth never means slower or less consistent replies.',
    problem: {
      title: 'When chat volume outgrows the team',
      body: 'Support quality drifts once several people answer in different ways, and queues grow quietly outside the hours your own team works.',
      points: ['Response times slip as volume grows', 'Tone and answers vary between agents', 'Nobody has a live view of the queue', 'Hiring and training cannot keep up with demand'],
    },
    manages: ['Incoming chat queues and assignment', 'First-line answers and follow-ups', 'Hand-offs and escalations to your team', 'Operator onboarding to your tone and policies'],
    delivery: [
      { title: 'Onboarding to your workflow', body: 'We learn your products, policies and tone, and agree what operators may resolve alone and what must be escalated.' },
      { title: 'Operators on your queue', body: 'Operators work in the GCO platform, where conversations are queued, assigned and timed.' },
      { title: 'Supervised from day one', body: 'Team leads watch the queue, review conversations and coach operators against your guidelines.' },
    ],
    workflow: ['A customer message arrives through the connected channel', 'The platform queues it and assigns an available operator', 'The operator replies, with an AI-drafted suggestion to review and edit when useful', 'Anything outside the agreed scope is escalated', 'Supervisors review and feed back into the guidelines'],
    capabilities: ['Real-time chat handling', 'Tone and policy alignment', 'Response timers and reassignment', 'AI-assisted reply drafting (a human always sends)', 'Operational reporting on queues and response times', 'Integration through the GCO ingestion pipeline, configured per client'],
    idealFor: ['Apps and platforms with growing chat support volume', 'E-commerce teams needing consistent first-line support', 'SaaS companies extending support hours without hiring a new team'],
    pilot: 'We agree the channel, volume and hours first, configure the workflow and onboard operators on Day 1, run your real conversations on Days 2-6 and review the results with you on Day 7.',
    industries: ['saas', 'ecommerce', 'apps-digital-platforms'],
    related: ['multilingual-chat-operations', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
    faqs: [
      { q: 'Which channels can you support?', a: 'GCO connects through a webhook-based ingestion pipeline. Specific channel connectors (for example WhatsApp or Meta channels) are built per client once we have your API access, and are confirmed during discovery.' },
      { q: 'Do your operators work inside our tools?', a: 'Operators work in the GCO platform. We integrate your channel with it; we confirm what is feasible during the discovery step before the pilot starts.' },
      { q: 'Does AI answer our customers?', a: 'No. AI drafts suggestions for the operator to review. A human operator sends every reply.' },
    ],
  },
  {
    slug: 'chat-moderation',
    name: 'Chat Moderation',
    short: 'Consistent human review of chat conversations against your rules, with escalation for edge cases.',
    metaTitle: 'Chat Moderation Services',
    metaDescription: 'Human chat moderation against your rules, with supervision, QA and a defined escalation path. Free 7-day pilot, no setup fee.',
    heroLead: 'Rules only work if they are applied the same way every time. GCO moderators review chat conversations against your standards and escalate the cases that need a human decision.',
    problem: {
      title: 'Moderation that depends on who is on shift',
      body: 'Automated filters miss context and inconsistent human review creates risk for users and for your brand.',
      points: ['Edge cases are decided differently by different people', 'Sensitive situations are not escalated in time', 'No record of why a decision was made', 'Moderation backlog grows with the community'],
    },
    manages: ['Review of chat conversations against your guidelines', 'Flagging and action according to agreed rules', 'Escalation of sensitive or ambiguous cases', 'Feedback on guideline gaps'],
    delivery: [
      { title: 'Guidelines first', body: 'We turn your rules into clear operator instructions, including examples and the cases that must be escalated.' },
      { title: 'Trained moderators', body: 'Operators are briefed on your policy before they handle live conversations.' },
      { title: 'Review and calibration', body: 'Supervisors review decisions and calibrate with you so judgement stays consistent.' },
    ],
    workflow: ['Conversations enter the moderation queue', 'A moderator reviews against the agreed guidelines', 'Clear cases are actioned; unclear or sensitive cases are escalated with a reason', 'Supervisors review decisions and refine the guidelines with you'],
    capabilities: ['Guideline-based review', 'Escalation with recorded reasons', 'Supervisor review of decisions', 'Queue visibility and workload distribution', 'Activity recorded for audit'],
    idealFor: ['Dating and social products', 'Online communities and chat-first apps', 'Marketplaces with user-to-user messaging'],
    pilot: 'We start with your guidelines and a defined slice of conversations, moderate it for seven days under supervision, and review decisions, edge cases and open questions together on Day 7.',
    industries: ['dating-social', 'online-communities', 'apps-digital-platforms'],
    related: ['community-moderation', 'multilingual-chat-operations', 'dedicated-outsourced-chat-teams'],
    faqs: [
      { q: 'Is moderation automated?', a: 'Moderation is performed by trained human operators. AI-assisted workflows can support operators, but a human is responsible for the decision.' },
      { q: 'What happens with difficult cases?', a: 'The operator escalates to a supervisor or team lead with a reason. If a client decision is needed, it goes to GCO management and the client contact.' },
      { q: 'Can you work to our policy?', a: 'Yes. We work to the guidelines you provide and refine them with you during the pilot.' },
    ],
  },
  {
    slug: 'community-moderation',
    name: 'Community Moderation',
    short: 'Human moderation and engagement support for communities, keeping spaces safe and active.',
    metaTitle: 'Community Moderation Services',
    metaDescription: 'Community moderation by trained human operators: keep your community safe and active with supervised, guideline-based moderation. Free 7-day pilot.',
    heroLead: 'A healthy community needs people who apply the rules fairly and keep conversations constructive. GCO provides supervised moderators for your community spaces.',
    problem: {
      title: 'Communities need steady, fair moderation',
      body: 'Volunteer moderation burns out and unmoderated spaces quickly become a risk to members and to your brand.',
      points: ['Moderation depends on a few overloaded people', 'Rule enforcement feels inconsistent to members', 'Incidents are slow to reach the right person', 'Growth outpaces the moderation team'],
    },
    manages: ['Day-to-day moderation of community conversations', 'Application of community rules and escalation of incidents', 'Support for members who need help', 'Reporting of patterns back to your team'],
    delivery: [
      { title: 'Community rules into practice', body: 'We translate your rules and tone into moderator guidance, with examples of what to action and what to escalate.' },
      { title: 'Supervised moderators', body: 'Moderators work under team leads who review decisions and keep application consistent.' },
      { title: 'Clear incident path', body: 'Serious or sensitive incidents follow the escalation path to your contact.' },
    ],
    workflow: ['Community conversations are routed to the moderation queue', 'Moderators apply the rules and engage where agreed', 'Incidents are escalated with context', 'Supervisors review and report patterns to you'],
    capabilities: ['Rule-based moderation', 'Member support within agreed scope', 'Incident escalation', 'Supervisor review', 'Operational reporting'],
    idealFor: ['Online communities and forums', 'Social and dating platforms', 'Apps with in-product community chat'],
    pilot: 'We agree the community spaces and rules, moderate them for seven days under supervision, and review incidents, response patterns and recommendations with you on Day 7.',
    industries: ['online-communities', 'dating-social', 'apps-digital-platforms'],
    related: ['chat-moderation', 'multilingual-chat-operations', '24-7-chat-coverage'],
    faqs: [
      { q: 'Do you handle member support as well?', a: 'Within the scope we agree. Community moderation can include answering member questions according to your guidelines.' },
      { q: 'How do serious incidents reach us?', a: 'Through the escalation path: operator, supervisor or team lead, then GCO management and your client contact when a decision is needed.' },
      { q: 'Which platforms do you work on?', a: 'It depends on how your community is delivered and what access is available. We confirm feasibility during the discovery step.' },
    ],
  },
  {
    slug: 'multilingual-chat-operations',
    name: 'Multilingual Chat Operations',
    short: 'Chat operations in English, Italian, French, German, Spanish and Swedish, staffed per project.',
    metaTitle: 'Multilingual Chat Operations',
    metaDescription: 'Multilingual chat operations in English, Italian, French, German, Spanish and Swedish. Language staffing is confirmed per project before go-live. Free 7-day pilot.',
    heroLead: 'Serve customers in the language they write in. GCO provides chat operations in English, Italian, French, German, Spanish and Swedish, with language staffing confirmed for your project before go-live.',
    problem: {
      title: 'One team rarely covers every language',
      body: 'Customers write in their own language and a monolingual team forces slow, awkward workarounds.',
      points: ['Customers wait while messages are translated or passed around', 'Tone is lost between languages', 'Language demand is uneven and hard to staff', 'Quality is hard to check in languages your team does not speak'],
    },
    manages: ['Conversations in the supported languages', 'Per-language guidelines and tone', 'Language coverage planning with you', 'Supervision of multilingual teams'],
    delivery: [
      { title: 'Language scoping', body: 'We agree which languages you need and how much volume each carries.' },
      { title: 'Staffing confirmed per project', body: 'Operators for each language are confirmed for your project before go-live; we do not promise coverage we have not staffed.' },
      { title: 'Consistent standards across languages', body: 'The same guidelines, supervision and escalation path apply in every language.' },
    ],
    workflow: ['Conversations carry their language on the platform', 'Operators staffed for that language handle them', 'Guidelines and tone are applied per language', 'Supervisors review conversations and coverage with you'],
    capabilities: ['English, Italian, French, German, Spanish and Swedish', 'Per-language guidelines', 'Language tagged conversations on the platform', 'Supervision and escalation in every language', 'Coverage planning per project'],
    idealFor: ['Platforms with users across several European markets', 'Dating, social and community products', 'E-commerce serving multiple countries'],
    pilot: 'We pick the languages and a representative volume, confirm staffing for them before Day 1, run the pilot in those languages and review quality and coverage with you on Day 7.',
    industries: ['dating-social', 'ecommerce', 'saas'],
    related: ['live-chat-customer-support', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
    faqs: [
      { q: 'Which languages are available?', a: 'English, Italian, French, German, Spanish and Swedish. Staffing for each is confirmed per project before go-live.' },
      { q: 'Can you add other languages?', a: 'Other languages are a conversation to have during discovery; we only commit to what we can staff.' },
      { q: 'Is conversation routing by language automatic?', a: 'Conversations carry their language on the platform; the languages you need are staffed and agreed per project.' },
    ],
  },
  {
    slug: '24-7-chat-coverage',
    name: '24/7 Chat Coverage',
    short: 'Around-the-clock chat coverage, planned around your volume and confirmed against staffing.',
    metaTitle: '24/7 Chat Coverage',
    metaDescription: '24/7 chat coverage planned around your volume and confirmed against project staffing. Shift-based human operators with supervision. Free 7-day pilot.',
    heroLead: 'Conversations do not stop when your team goes home. GCO can provide 24/7 chat coverage, subject to project staffing requirements: planned around your volume and confirmed with you before go-live.',
    problem: {
      title: 'Gaps outside office hours',
      body: 'Messages that wait overnight or at weekends cost trust, and extending your own team to night shifts is expensive.',
      points: ['Customers wait until the next working day', 'Weekend and holiday coverage is thin', 'Night shifts are hard to hire and manage', 'Handovers between shifts lose context'],
    },
    manages: ['Shift planning against your volume pattern', 'Handover between shifts', 'Supervision across all hours', 'Escalation path outside business hours'],
    delivery: [
      { title: 'Coverage plan', body: 'We map when your conversations arrive and plan shifts to match, rather than assuming every hour needs the same staffing.' },
      { title: 'Staffing confirmed per project', body: '24/7 is an operational capability. We confirm the staffing for your project before go-live; it is not automatically included for every client.' },
      { title: 'Supervised round the clock', body: 'Team leads supervise across shifts so quality and escalation work the same at 3 a.m. as at 3 p.m.' },
    ],
    workflow: ['Volume patterns are mapped and shifts planned', 'Operators pick up conversations in their shift', 'Shift handovers carry the context', 'Supervisors cover every shift and escalate when needed'],
    capabilities: ['Shift-based staffing', 'Handover notes and conversation history', 'Response timers and reassignment', 'Supervision across shifts', 'Coverage reporting'],
    idealFor: ['Global or multi-timezone user bases', 'Chat-first apps used outside office hours', 'Teams that want after-hours and weekend cover without building a night shift'],
    pilot: 'We agree which hours the pilot covers, confirm staffing for them before Day 1, and review how the covered hours performed on Day 7 before planning wider coverage.',
    industries: ['dating-social', 'apps-digital-platforms', 'ecommerce'],
    related: ['live-chat-customer-support', 'multilingual-chat-operations', 'dedicated-outsourced-chat-teams'],
    faqs: [
      { q: 'Is 24/7 included automatically?', a: 'No. 24/7 coverage is available subject to project staffing requirements and is confirmed with you before go-live.' },
      { q: 'Can we start with part-time coverage?', a: 'Yes. Many operations start with the hours that matter most and extend from there.' },
      { q: 'What about escalations at night?', a: 'The same escalation path applies: operator, supervisor or team lead, then GCO management and your client contact when a decision is needed.' },
    ],
  },
  {
    slug: 'dedicated-outsourced-chat-teams',
    name: 'Dedicated / Outsourced Chat Teams',
    short: 'A managed team of operators and supervisors dedicated to your chat operation, scaled as you grow.',
    metaTitle: 'Dedicated & Outsourced Chat Teams',
    metaDescription: 'Dedicated or outsourced chat teams: trained operators and team leads dedicated to your operation, on the GCO platform. Start with a free 7-day pilot.',
    heroLead: 'When a pilot proves the model, you can scale to a team that is dedicated to your operation. GCO recruits, trains, supervises and manages it, so you get a chat team without building one.',
    problem: {
      title: 'Building an in-house chat team is slow and distracting',
      body: 'Recruiting, training, scheduling and managing operators pulls attention from your product and rarely scales cleanly.',
      points: ['Hiring and training take months', 'Scheduling and coverage are a constant puzzle', 'Quality depends on management attention', 'Scaling up or down is slow'],
    },
    manages: ['Team structure: operators and supervisors', 'Training and onboarding to your operation', 'Scheduling and capacity planning', 'Quality supervision and reporting'],
    delivery: [
      { title: 'Start from a pilot', body: 'The pilot defines the workflow, volume and standards that the dedicated team will run on.' },
      { title: 'Team sized to your demand', body: 'We size the team to your volume and coverage, and adjust it as your operation changes.' },
      { title: 'Managed by GCO', body: 'Staffing, supervision, escalation and reporting are run by GCO on its platform.' },
    ],
    workflow: ['Pilot results define the operating model', 'The team structure and capacity are agreed', 'The team is onboarded and goes live', 'Supervisors manage quality and escalations', 'Capacity is reviewed and adjusted with you'],
    capabilities: ['Dedicated operators and team leads', 'Capacity and workload visibility', 'Supervision & QA', 'Defined escalation path', 'Reporting on operations', 'Scaling up or down with demand'],
    idealFor: ['Companies moving from a pilot to a standing operation', 'Platforms with steady, high chat volume', 'Teams who want to outsource chat operations end to end'],
    pilot: 'The 7-day pilot is the first step: it defines the workflow and standards. After Day 7, if you choose to continue, we agree the team structure and commercial terms with you.',
    industries: ['dating-social', 'online-communities', 'saas', 'ecommerce', 'apps-digital-platforms'],
    related: ['live-chat-customer-support', 'multilingual-chat-operations', '24-7-chat-coverage'],
    faqs: [
      { q: 'How big can a dedicated team be?', a: 'Team size depends on your volume and coverage. We size it with you after the pilot rather than quoting a number up front.' },
      { q: 'Who manages the team?', a: 'GCO supervisors and team leads manage the operators and report to you.' },
      { q: 'What does it cost?', a: 'After the free pilot we agree commercial terms with you based on the scope. There is no long-term commitment required for the pilot.' },
    ],
  },
]

export const getService = (slug: string) => SERVICES.find((s) => s.slug === slug)
