import { COVERAGE_OPTIONS, LANGUAGES, SERVICE_OPTIONS, VOLUME_OPTIONS } from '@/lib/content/site'

// Pilot-form answers -> onboarding "requested profile". Explicit mapping only: each field is matched
// against the form's own fixed option lists (or the six approved languages) and anything else is dropped.
// Arbitrary free text (the visitor's message, company name, website) is never copied into operational data.
// The result is a starting point shown to management - it does not configure anything by itself;
// languages and coverage still need explicit human confirmation before go-live.
export interface RequestedProfile {
  services: string[]
  languages: string[]
  coverage: string | null
  volume: string | null
}

const NOT_SURE = 'Not sure yet'

function lastValue(notes: string, label: string): string | null {
  const re = new RegExp(`^${label}:\\s*(.+)$`, 'gim')
  let value: string | null = null
  for (const m of notes.matchAll(re)) value = m[1]!.trim() // newest request wins (repeat inquiries append)
  return value
}

function pick<T extends readonly string[]>(options: T, raw: string | null): T[number] | null {
  if (!raw) return null
  const found = options.find((o) => o.toLowerCase() === raw.toLowerCase())
  return found && found !== NOT_SURE ? found : null
}

export function extractRequestedProfile(notes: string | null | undefined): RequestedProfile {
  const text = (notes ?? '').slice(0, 20_000)
  const service = pick(SERVICE_OPTIONS, lastValue(text, 'Interested in'))
  const langRaw = lastValue(text, 'Languages')
  const languages = langRaw
    ? [...new Set(langRaw.split(/[,;/]/).map((l) => LANGUAGES.find((a) => a.toLowerCase() === l.trim().toLowerCase())).filter((l): l is (typeof LANGUAGES)[number] => !!l))]
    : []
  return {
    services: service ? [service] : [],
    languages,
    coverage: pick(COVERAGE_OPTIONS, lastValue(text, 'Coverage needed')),
    volume: pick(VOLUME_OPTIONS, lastValue(text, 'Approx. monthly message/conversation volume')),
  }
}
