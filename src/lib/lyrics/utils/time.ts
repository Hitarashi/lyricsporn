export function parseLrcTime(raw: string): number | null {
  const parts = raw.trim().split(':')
  if (parts.length !== 2) return null
  if (parts.some((part) => !part.trim())) return null
  const minutes = Number(parts[0])
  const seconds = Number(parts[1])
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) {
    return null
  }
  const milliseconds = minutes * 60_000 + seconds * 1_000
  return Number.isFinite(milliseconds) ? Math.round(milliseconds) : null
}

export function parseTtmlTime(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const units: Array<[string, number]> = [
    ['ms', 1],
    ['h', 3_600_000],
    ['m', 60_000],
    ['s', 1_000],
  ]

  for (const [suffix, scale] of units) {
    if (value.endsWith(suffix)) {
      const numericPart = value.slice(0, -suffix.length).trim()
      if (!numericPart) return null
      const num = Number(numericPart)
      const milliseconds = num * scale
      if (Number.isFinite(num) && num >= 0 && Number.isFinite(milliseconds)) {
        return Math.round(milliseconds)
      }
    }
  }

  const parts = value.split(':')
  if (parts.some((part) => !part.trim())) return null
  if (parts.length === 1) {
    const s = Number(parts[0])
    const milliseconds = s * 1_000
    return !Number.isFinite(s) || s < 0 || !Number.isFinite(milliseconds)
      ? null
      : Math.round(milliseconds)
  }
  if (parts.length === 2) {
    const m = Number(parts[0])
    const s = Number(parts[1])
    const milliseconds = m * 60_000 + s * 1_000
    return !Number.isFinite(m) ||
      !Number.isFinite(s) ||
      m < 0 ||
      s < 0 ||
      !Number.isFinite(milliseconds)
      ? null
      : Math.round(milliseconds)
  }
  if (parts.length === 3) {
    const h = Number(parts[0])
    const m = Number(parts[1])
    const s = Number(parts[2])
    const milliseconds = h * 3_600_000 + m * 60_000 + s * 1_000
    return !Number.isFinite(h) ||
      !Number.isFinite(m) ||
      !Number.isFinite(s) ||
      h < 0 ||
      m < 0 ||
      s < 0 ||
      !Number.isFinite(milliseconds)
      ? null
      : Math.round(milliseconds)
  }
  return null
}

export function formatTime(ms: number): string {
  const safeMs = Math.max(0, ms)
  const totalSeconds = Math.floor(safeMs / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const remainderMs = safeMs % 1_000

  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  const mmm = String(remainderMs).padStart(3, '0')
  return `${mm}:${ss}.${mmm}`
}
