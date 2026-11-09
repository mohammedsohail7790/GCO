// Time-zone display for shifts. Shifts are stored in UTC; people in different countries read them in a named zone, never in
// whatever zone their browser happens to be in without saying so. Pure functions (Intl only), shared by server and client.

/** "Mon 9 Nov, 14:00" in the given IANA zone. */
export function formatInZone(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** "14:00" in the given IANA zone. */
export function timeInZone(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
}

/** Short offset label at that moment, e.g. "GMT+1", "GMT+5:30", "GMT" - unambiguous across countries (unlike "CST"). */
export function zoneOffsetLabel(at: string | Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
}

/**
 * A shift range read in one zone: "Mon 9 Nov, 09:00–17:00 (Europe/Rome, GMT+1)". When the shift ends on another calendar day in
 * that zone, the end carries its own date: "Mon 9 Nov, 22:00 – Tue 10 Nov, 06:00 (…)".
 */
export function rangeInZone(startsAt: string | Date, endsAt: string | Date, timeZone: string): string {
  const day = (d: string | Date) => new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d))
  const end = day(startsAt) === day(endsAt) ? timeInZone(endsAt, timeZone) : ` ${formatInZone(endsAt, timeZone)}`
  const sep = end.startsWith(' ') ? ' –' : '–'
  return `${formatInZone(startsAt, timeZone)}${sep}${end} (${timeZone}, ${zoneOffsetLabel(startsAt, timeZone)})`
}
