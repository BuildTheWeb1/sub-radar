/** 412000 -> "412k", 1240000 -> "1.2m". Member counts are scanned, not read. */
export function formatMembers(count: number | null): string | null {
  if (count == null || !Number.isFinite(count)) return null
  if (count >= 1_000_000) {
    const m = count / 1_000_000
    return `${m >= 10 ? Math.round(m) : m.toFixed(1)}m members`
  }
  if (count >= 1_000) return `${Math.round(count / 1_000)}k members`
  return `${count} members`
}
