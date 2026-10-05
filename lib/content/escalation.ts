// Approved escalation workflow (public wording). Exactly three levels - do not add tiers.

export const ESCALATION_STEPS = [
  { level: 'Operator', body: 'Handles the conversation and raises an escalation, with a reason and a note, when it cannot be resolved safely alone.' },
  { level: 'Supervisor / Team Lead', body: 'Takes the escalation, reviews the conversation, adds internal notes and resolves it, or escalates further when a client decision is required.' },
  { level: 'GCO Management / Client Contact', body: 'Handles escalations that need a decision from the client, records the decision, and closes the loop with the team.' },
] as const

export const ESCALATION_WHEN = [
  'The operator needs a decision',
  'Client-side approval is needed',
  'A sensitive or exceptional situation occurs',
  'The operator cannot safely resolve the conversation',
] as const

export const ESCALATION_RECORDED =
  'Every escalation is recorded on the platform: who raised it, why, who handled it, each status change and the resolution.'

export const SUPERVISION_QA = {
  title: 'Supervision & QA',
  body: 'Operations run under team leads who supervise live queues and review conversations against the standards agreed with you. GCO formalises this workflow further as the operation grows; we do not claim a large QA department, certifications or quality statistics.',
  points: [
    'Team leads monitor queues, assignments and response timers',
    'Conversations are reviewed against the agreed guidelines',
    'Feedback goes back to operators; guidelines are refined with you',
    'A defined escalation path when a human decision is needed',
  ],
} as const
