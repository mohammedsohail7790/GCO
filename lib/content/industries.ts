// Approved industries. Dating & Social is GCO's strongest initial specialisation, but GCO is a
// broader chat-operations / BPO company - copy must never position it as dating-only.
// No customer names, logos, statistics or case studies belong here.

export interface Industry {
  slug: string
  name: string
  short: string
  metaTitle: string
  metaDescription: string
  heroLead: string
  workload: string[]
  challenges: string[]
  whereHumansHelp: string[]
  moderationSupport: string[]
  supervisionEscalation: string
  howGcoSupports: string[]
  services: string[] // service slugs
  note?: string
}

export const INDUSTRIES: Industry[] = [
  {
    slug: 'dating-social',
    name: 'Dating & Social',
    short: 'Chat moderation and user conversations for dating and social platforms: our strongest initial specialisation.',
    metaTitle: 'Chat Operations for Dating & Social Platforms',
    metaDescription: 'Chat moderation and user conversation operations for dating and social platforms, with supervision, QA and escalation. Dating & Social is GCO\'s strongest initial specialisation.',
    heroLead: 'Dating and social platforms live on conversation. GCO provides trained operators for moderation and user conversations, with supervision and a clear escalation path for sensitive situations.',
    workload: ['High volumes of one-to-one chat', 'Moderation of conversations and profiles-related messaging', 'User support and account questions', 'Peaks in the evening and at weekends'],
    challenges: ['Sensitive and exceptional situations that need human judgement', 'Consistent application of safety and conduct rules', 'Multiple languages across markets', 'Coverage when users are most active'],
    whereHumansHelp: ['Judging context and intent in sensitive conversations', 'Handling users with care and consistent tone', 'Escalating situations that must not be handled alone'],
    moderationSupport: ['Moderation against your conduct and safety guidelines', 'Flagging and escalation of sensitive cases', 'Support conversations within the agreed scope'],
    supervisionEscalation: 'Team leads supervise the queue and review conversations. Sensitive cases follow the escalation path: operator, supervisor or team lead, then GCO management and your client contact when a decision is needed.',
    howGcoSupports: ['Moderation and user-conversation queues on the GCO platform', 'Multilingual operators in English, Italian, French, German, Spanish and Swedish, staffed per project', '24/7 coverage available subject to project staffing', 'A free 7-day pilot on your real workflow'],
    services: ['chat-moderation', 'multilingual-chat-operations', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
    note: 'Dating & Social is where GCO is strongest today. The same operating model applies to the other industries on this site.',
  },
  {
    slug: 'online-communities',
    name: 'Online Communities',
    short: 'Community moderation and member support that keeps spaces safe, active and fair.',
    metaTitle: 'Chat Operations for Online Communities',
    metaDescription: 'Community moderation and member support for online communities, with supervision, QA and escalation. Free 7-day pilot.',
    heroLead: 'Communities thrive when rules are applied fairly and members get a timely response. GCO provides supervised moderators and operators for your community spaces.',
    workload: ['Moderation of public and group conversations', 'Member questions and onboarding help', 'Incident reports from members', 'Activity that grows with the community'],
    challenges: ['Moderation that depends on a few overloaded people', 'Fair, consistent rule enforcement', 'Timely handling of incidents', 'Growth outpacing the moderation team'],
    whereHumansHelp: ['Interpreting context and tone in group conversations', 'Handling disputes and sensitive situations', 'Keeping engagement constructive'],
    moderationSupport: ['Rule-based moderation of community conversations', 'Incident handling and escalation', 'Reporting patterns back to your team'],
    supervisionEscalation: 'Supervisors review moderation decisions and handle escalations. When a decision belongs to you, it goes to GCO management and your client contact.',
    howGcoSupports: ['Community moderation operators on a shared platform with queues and timers', 'Multilingual coverage staffed per project', 'Extended or 24/7 coverage subject to staffing', 'A free 7-day pilot'],
    services: ['community-moderation', 'chat-moderation', 'multilingual-chat-operations', '24-7-chat-coverage'],
  },
  {
    slug: 'saas',
    name: 'SaaS',
    short: 'Live chat support for software products: consistent first-line answers and a clear path to your team.',
    metaTitle: 'Chat Support Operations for SaaS',
    metaDescription: 'Live chat customer support for SaaS companies by trained operators, with supervision, QA and escalation to your team. Free 7-day pilot.',
    heroLead: 'In-app and website chat is often a SaaS company\'s front line. GCO provides trained operators who handle first-line conversations and escalate what needs your team.',
    workload: ['Onboarding and how-to questions', 'Account and billing questions', 'Bug reports and triage', 'Pre-sales questions on website chat'],
    challenges: ['Support demand that spikes with releases', 'Coverage across time zones', 'Keeping answers accurate as the product changes', 'Handing technical issues to the right team'],
    whereHumansHelp: ['Understanding what the user is really asking', 'Triage and clear hand-offs to your engineers', 'Maintaining a consistent, helpful tone'],
    moderationSupport: ['Light moderation of in-product chat where relevant'],
    supervisionEscalation: 'Operators escalate anything they cannot resolve to a supervisor or team lead; client decisions go to GCO management and your client contact.',
    howGcoSupports: ['Live chat support queues on the GCO platform', 'Guidelines built from your documentation and policies', 'Multilingual support staffed per project', 'A free 7-day pilot on your real chat'],
    services: ['live-chat-customer-support', 'multilingual-chat-operations', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
  },
  {
    slug: 'ecommerce',
    name: 'E-commerce',
    short: 'Pre- and post-purchase chat support for online stores, in the languages of your customers.',
    metaTitle: 'Chat Support Operations for E-commerce',
    metaDescription: 'Live chat customer support for e-commerce: order, delivery and returns questions handled by trained operators, with supervision and escalation. Free 7-day pilot.',
    heroLead: 'Shoppers want quick answers before and after they buy. GCO provides trained chat operators for order, delivery and returns questions, with supervision and escalation to your team.',
    workload: ['Order status and delivery questions', 'Returns and refund requests', 'Product questions before purchase', 'Peaks around campaigns and seasons'],
    challenges: ['Seasonal peaks that are hard to staff', 'Consistent application of return and refund policy', 'Several markets and languages', 'Requests that need a decision from your team'],
    whereHumansHelp: ['Handling frustrated customers with empathy', 'Applying policy with judgement', 'Escalating exceptions that need approval'],
    moderationSupport: ['Moderation where stores run community or review chat'],
    supervisionEscalation: 'Exceptions such as refunds above agreed limits are escalated: operator, supervisor or team lead, then GCO management and your client contact for the decision.',
    howGcoSupports: ['Support queues with timers and reassignment', 'Operators briefed on your policies', 'Multilingual coverage staffed per project', 'Integration with store systems confirmed during discovery', 'A free 7-day pilot'],
    services: ['live-chat-customer-support', 'multilingual-chat-operations', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
  },
  {
    slug: 'apps-digital-platforms',
    name: 'Apps & Digital Platforms',
    short: 'Chat operations for apps and platforms with user-to-user or user-to-support messaging.',
    metaTitle: 'Chat Operations for Apps & Digital Platforms',
    metaDescription: 'Chat support and moderation for apps and digital platforms: trained operators, supervision, QA and escalation on the GCO operations platform. Free 7-day pilot.',
    heroLead: 'Apps and digital platforms need chat that scales with their users. GCO provides the human operations layer: support, moderation and coverage, backed by an operations platform.',
    workload: ['In-app support chat', 'Moderation of user-to-user messaging', 'Trust and safety related conversations', 'Usage that follows your product\'s growth'],
    challenges: ['Chat volume that grows faster than the team', 'Round-the-clock expectations from users', 'Several languages and markets', 'Needing visibility into what happens in chat'],
    whereHumansHelp: ['Judging context where automation is not enough', 'Handling sensitive situations with care', 'Giving your team clear reports and escalations'],
    moderationSupport: ['Guideline-based moderation of user messaging', 'Escalation of safety-related cases to your contact'],
    supervisionEscalation: 'Supervisors and team leads oversee the operation, and the escalation path runs from operator through supervisor to GCO management and your client contact.',
    howGcoSupports: ['Webhook-based integration with your platform, configured per client', 'Support, moderation and coverage services on one platform', 'Multilingual operators staffed per project', 'A free 7-day pilot to prove the workflow'],
    services: ['live-chat-customer-support', 'chat-moderation', '24-7-chat-coverage', 'dedicated-outsourced-chat-teams'],
  },
]

export const getIndustry = (slug: string) => INDUSTRIES.find((i) => i.slug === slug)
