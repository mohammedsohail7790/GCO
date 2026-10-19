// Privacy regimes GCO may operate under, with INDICATIVE defaults only. These numbers drive due dates and suggestions in the
// admin screens; they are NOT legal advice and must be confirmed per client contract and country by qualified counsel.
export interface Regime {
  key: string
  label: string
  /** Typical time limit to answer a data-subject request, in days (indicative). */
  requestDeadlineDays: number
  notes: string
}

export const REGIMES: Record<string, Regime> = {
  GDPR: { key: 'GDPR', label: 'EU GDPR', requestDeadlineDays: 30, notes: 'Respond without undue delay and within one month (extendable by two months for complex requests). Processor assists the controller.' },
  UK_GDPR: { key: 'UK_GDPR', label: 'UK GDPR', requestDeadlineDays: 30, notes: 'One month; international transfers need the UK IDTA/addendum or an adequacy decision.' },
  CCPA: { key: 'CCPA', label: 'California CCPA/CPRA', requestDeadlineDays: 45, notes: '45 days, extendable once by 45 days. GCO would act as a service provider under a written contract.' },
  LGPD: { key: 'LGPD', label: 'Brazil LGPD', requestDeadlineDays: 15, notes: 'Short statutory response windows apply to some requests; confirm with local counsel.' },
  OTHER: { key: 'OTHER', label: 'Other / local law', requestDeadlineDays: 30, notes: 'Set once local counsel has confirmed the requirements for this country.' },
}

export function knownRegime(key: string): boolean {
  return key in REGIMES
}

/** The strictest (shortest) deadline among a client's regimes; GDPR when none is set. */
export function requestDeadlineDays(regulations: readonly string[]): number {
  const days = regulations.filter(knownRegime).map((k) => REGIMES[k]!.requestDeadlineDays)
  return days.length ? Math.min(...days) : REGIMES.GDPR!.requestDeadlineDays
}
