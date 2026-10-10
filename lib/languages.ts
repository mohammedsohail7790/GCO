// Language handling for conversation routing. Languages are ISO 639-1 codes ("en", "es"). GCO does NOT detect or
// translate languages: a conversation's language is whatever the client's platform supplies (or a manager sets), and
// an operator's languages are what a manager has recorded for them.

export const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic', de: 'German', en: 'English', es: 'Spanish', fr: 'French', hi: 'Hindi', it: 'Italian', ja: 'Japanese',
  ko: 'Korean', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', ru: 'Russian', sv: 'Swedish', tr: 'Turkish', zh: 'Chinese',
}

/** "ES", "es-MX", "es_mx" -> "es"; anything that is not a 2-letter code (optionally with a region) -> null. */
export function normalizeLanguage(input: string | null | undefined): string | null {
  if (!input) return null
  const m = /^([a-z]{2})(?:[-_][a-z]{2,4})?$/i.exec(input.trim())
  return m ? m[1]!.toLowerCase() : null
}

export function normalizeLanguageList(list: string[]): string[] {
  const out = new Set<string>()
  for (const l of list) {
    const n = normalizeLanguage(l)
    if (n) out.add(n)
  }
  return [...out].sort()
}

export function languageLabel(code: string | null | undefined): string {
  const n = normalizeLanguage(code)
  if (!n) return 'Unspecified'
  return LANGUAGE_NAMES[n] ?? n.toUpperCase()
}

/**
 * Can an operator take a conversation in `conversationLanguage`?
 * - conversation language unknown -> yes (no restriction, existing behaviour)
 * - operator has no languages recorded -> yes (unrestricted operator, existing behaviour)
 * - otherwise the operator must list the language.
 */
export function operatorCoversLanguage(operatorLanguages: string[], conversationLanguage: string | null | undefined): boolean {
  const lang = normalizeLanguage(conversationLanguage)
  if (!lang) return true
  if (operatorLanguages.length === 0) return true
  return operatorLanguages.includes(lang)
}
