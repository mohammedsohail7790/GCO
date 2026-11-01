// CSV writer for management exports (RFC 4180 quoting). Spreadsheet applications run a cell that starts with = + - @ (or a tab/CR) as a
// formula, so any text cell starting that way is prefixed with an apostrophe; numbers and dates are written as they are.
export type CsvCell = string | number | boolean | Date | null | undefined

function cell(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  let s = v instanceof Date ? v.toISOString() : String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}
