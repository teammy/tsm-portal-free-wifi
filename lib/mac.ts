/** Canonical form stored in registrations: AA-BB-CC-DD-EE-FF */
export function normalizeMac(raw: string): string | null {
  const hex = raw.replace(/[^0-9a-f]/gi, '').toUpperCase()
  if (hex.length !== 12) return null
  return hex.match(/.{2}/g)!.join('-')
}
