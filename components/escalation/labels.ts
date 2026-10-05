export const REASON_LABELS: Record<string, string> = {
  DECISION_NEEDED: 'Operator needs a decision',
  CLIENT_APPROVAL_NEEDED: 'Client-side approval needed',
  SENSITIVE_SITUATION: 'Sensitive / exceptional situation',
  CANNOT_RESOLVE_SAFELY: 'Cannot safely resolve',
}
export const LEVEL_LABELS: Record<string, string> = { SUPERVISOR: 'Supervisor / Team Lead', CLIENT_DECISION: 'Client decision (GCO management)' }
export const STATUS_LABELS: Record<string, string> = { OPEN: 'Open', CLAIMED: 'In progress', RESOLVED: 'Resolved' }
