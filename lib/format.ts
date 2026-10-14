/** 11700 → "3 ชั่วโมง 15 นาที" (rounded down to the minute) */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} ชั่วโมง ${m} นาที`
  if (h) return `${h} ชั่วโมง`
  return `${m} นาที`
}
