// "Inside GCO - Our Technology in Action": the public tour of the real platform.
//
// Provenance: every image and the video are captured from the real GCO web application running against an isolated local
// copy that contains ONLY fictional demo data (invented people, companies and conversations). Nothing comes from production,
// and no credentials, addresses of systems, or client information appear. The CRM / sales pipeline and client panel are
// deliberately NOT shown. Wording stays inside the approved claims: no translation or language detection, no automatic
// scoring, no service-level guarantees, AI only assists and the human operator sends every reply.

export interface InsideSection {
  id: string
  eyebrow: string
  title: string
  lead: string
  points: readonly string[]
  image: { src: string; alt: string; width: number; height: number; caption: string }
}

export const INSIDE_SECTIONS: readonly InsideSection[] = [
  {
    id: 'operator-dashboard',
    eyebrow: '1 · Operator dashboard',
    title: 'Where an operator works a conversation',
    lead: 'Each operator sees only their own conversations, with everything needed to answer well in one screen.',
    points: [
      'The customer’s message, their language and a response timer for every conversation',
      'Internal notes that the customer never sees, and extracted facts that stay with the conversation',
      'Resolve when it is done, or escalate to a supervisor when a decision is needed',
      'AI can suggest a draft; the operator reviews it, edits it and presses Send. Nothing is sent automatically.',
    ],
    image: {
      src: '/inside-gco/operator.webp',
      alt: 'Operator workspace with one active Spanish conversation, a response timer, resolve and escalate buttons, and the operator typing a reply',
      width: 2880,
      height: 1400,
      caption: 'Operator workspace: an active conversation with its timer, notes, and the operator’s own reply ready to send.',
    },
  },
  {
    id: 'queue-management',
    eyebrow: '2 · Live chat and queue management',
    title: 'Incoming messages are queued, assigned and tracked',
    lead: 'Customer messages arrive from the client’s platform through a signed connection and enter a single supervised queue.',
    points: [
      'Each message goes to an available operator who has capacity and speaks the customer’s language',
      'If nobody can take it yet, it waits in the queue and is assigned the moment someone can',
      'Supervisors see every conversation, its state, language and the operator who holds it, and can search the history',
      'Response timers and alerts make slow or unassigned conversations visible early',
    ],
    image: {
      src: '/inside-gco/queue.webp',
      alt: 'Supervisor view of the live queue with counts of available operators, queue size and active conversations, and a searchable conversation list showing active, queued and waiting conversations by language',
      width: 2400,
      height: 1932,
      caption: 'Queue and conversation history: states, languages and owners at a glance.',
    },
  },
  {
    id: 'supervisor-dashboard',
    eyebrow: '3 · Supervisor dashboard',
    title: 'Supervisors see the whole operation and handle escalations',
    lead: 'The supervisor view shows who is available, how loaded each operator is, and what needs a decision.',
    points: [
      'Available and busy operators, queue size, active conversations and response-time breaches',
      'An escalation queue: the operator’s note, who has claimed it, and its status',
      'A supervisor can claim, add internal notes, resolve, or pass a client-facing summary to the client for a decision',
      'Every escalation step is recorded',
    ],
    image: {
      src: '/inside-gco/supervisor.webp',
      alt: 'Supervisor dashboard showing operator availability and load, and an open escalation with the operator’s note and claim, note and resolve controls',
      width: 2400,
      height: 1546,
      caption: 'Supervisor dashboard: operator load and an escalation waiting to be claimed.',
    },
  },
  {
    id: 'quality-control',
    eyebrow: '4 · Quality control',
    title: 'Sent replies are reviewed by a person and scored',
    lead: 'Quality review is done by supervisors on real replies, and the results are kept per operator.',
    points: [
      'Each sent reply is shown next to the customer’s message so it can be judged in context',
      'Supervisors score accuracy, tone and resolution, flag issues and leave a coaching note',
      'Per-operator averages and pass / coach / fail counts come only from reviews a supervisor has entered',
      'There is no automatic scoring and no invented performance number',
    ],
    image: {
      src: '/inside-gco/quality.webp',
      alt: 'Quality review panel with a customer message, the operator’s reply, accuracy tone and resolution rating buttons, quality flags, a coaching note field, and operator score averages',
      width: 2400,
      height: 1112,
      caption: 'Quality review: a reply scored on accuracy, tone and resolution, with a coaching note.',
    },
  },
  {
    id: 'multilingual-operations',
    eyebrow: '5 · Multilingual operations',
    title: 'Conversations go to operators who speak the language',
    lead: 'Language is handled by people, not by machine translation.',
    points: [
      'Each operator has the languages they handle; a conversation is only routed to someone who handles its language',
      'The coverage panel shows, per language, what is in progress, what is waiting, and whether an available operator covers it',
      'When no available operator covers a language, supervisors are alerted so staffing can be adjusted',
      'Languages and staffing are confirmed per project before go-live. GCO does not translate or detect language automatically; the language comes from the client’s platform.',
    ],
    image: {
      src: '/inside-gco/languages.webp',
      alt: 'Language coverage panel with alerts for languages that have no available operator, a table of conversations by language with coverage status, and each operator’s languages',
      width: 2400,
      height: 1110,
      caption: 'Language coverage: gaps are flagged, and each operator’s languages are visible and editable by supervisors.',
    },
  },
] as const

export const INSIDE_WORKFLOW = [
  { title: 'A customer writes', body: 'The message arrives from the client’s own platform through a signed, verified connection.' },
  { title: 'It is queued', body: 'The conversation enters the queue with its language and a response timer.' },
  { title: 'It is assigned', body: 'An available operator with capacity and the right language takes it. Nobody is over-assigned.' },
  { title: 'A person answers', body: 'The operator reads, optionally uses an AI suggestion, then writes and sends the reply themselves.' },
  { title: 'Supervisors oversee', body: 'Escalations go to a supervisor; sent replies are reviewed and scored; alerts flag gaps.' },
  { title: 'It is completed and recorded', body: 'The conversation is resolved, and the full transcript, notes and reviews stay on record.' },
] as const

export const INSIDE_VIDEO = {
  src: '/inside-gco/inside-gco.mp4',
  poster: '/inside-gco/poster.webp',
  captions: '/inside-gco/captions.vtt',
  title: 'The GCO workflow in about 75 seconds',
  summary: 'A real screen recording of the platform with fictional demo data: an operator replies, the queue and history, an escalation, a quality review, and language coverage.',
} as const

export const INSIDE_DEMO_NOTE = 'Everything on this page was captured from the real GCO platform running on an isolated demo environment with fictional people, companies and conversations. No client or production data is shown.'
