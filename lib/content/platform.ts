// Platform positioning. Every capability below exists in the GCO operations platform today
// (see docs/client-capability-matrix.md and the platform code); nothing here is aspirational.
// Human judgment + AI assistance + operational infrastructure. AI assists operators; it does not replace them.

export const PLATFORM_CAPABILITIES = [
  { title: 'Live conversation queues', body: 'Incoming conversations are queued and prioritised, with the queue visible to supervisors in real time.' },
  { title: 'Automatic and manual assignment', body: 'Conversations are assigned automatically to available operators using race-safe assignment, and can be reassigned manually by supervisors.' },
  { title: 'Response timers', body: 'Each assignment carries a response deadline that the system tracks; expired assignments are released back to the queue.' },
  { title: 'Reassignment', body: 'Work moves to another operator when a deadline passes or a supervisor decides it should.' },
  { title: 'Workload and operator status', body: 'Operator availability and capacity are visible, so work is distributed against real workload.' },
  { title: 'Language tagged conversations', body: 'Conversations carry their language, and operators are staffed per language for each project.' },
  { title: 'Supervisor visibility', body: 'A manager dashboard shows operators, queue size, active conversations and SLA breaches.' },
  { title: 'Escalation workflow', body: 'Operators escalate with a reason; supervisors claim, note and resolve, or escalate to GCO management and the client contact. Every step is recorded.' },
  { title: 'Operational reporting', body: 'Live operational figures such as queue size, response times and SLA breaches, plus usage reporting.' },
  { title: 'Activity monitoring', body: 'Actions on the platform, from assignments to escalations, are recorded for audit.' },
  { title: 'AI-assisted workflows', body: 'AI drafts suggested replies and extracts facts to help the operator. The operator reviews, edits and sends; nothing is sent automatically.' },
  { title: 'Security controls', body: 'Role-based access, client/tenant isolation, signed webhook verification, rate limiting and HTTPS. No certifications are claimed.' },
] as const

export const PLATFORM_FLOW = [
  { title: 'Conversation arrives', body: 'Through the client\'s channel, via the GCO ingestion pipeline.' },
  { title: 'Queued and assigned', body: 'To an available operator, with a response timer.' },
  { title: 'Human operator replies', body: 'With an AI-drafted suggestion to review when useful.' },
  { title: 'Supervised', body: 'Supervisors see queues and review conversations.' },
  { title: 'Escalated when needed', body: 'Operator, then supervisor or team lead, then GCO management and the client contact.' },
] as const
