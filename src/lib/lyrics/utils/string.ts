import type { LyricsLookup } from '../types'

export function formEncode(value: string): string {
  return encodeURIComponent(value)
}

export function uriComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '%20')
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/~/g, '%7E')
}

export function titleKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*(?:[-–—]\s*)?(?:feat\.?|ft\.?|featuring)\b.*$/i, '')
    .replace(/\s*\([^)]*(?:remix|mix|version|edit|remaster|live)[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*(?:remix|mix|version|edit|remaster|live)[^\]]*\]/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function artistKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*(?:feat\.?|ft\.?|featuring)\b.*$/i, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function artistParts(value: string): string[] {
  return value
    .split(/\s*(?:,|&|\/|\\|;|、|，|\band\b|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)
    .map(artistKey)
    .filter(Boolean)
}

export function titleMatches(wanted: string, candidate: string): boolean {
  const w = titleKey(wanted)
  const c = titleKey(candidate)
  if (!w || !c) return false
  return w === c || w.includes(c) || c.includes(w)
}

export function artistsMatch(wanted: string, candidate: string): boolean {
  const w = artistKey(wanted)
  const c = artistKey(candidate)
  if (w && c && (w === c || w.includes(c) || c.includes(w))) return true

  const wantedParts = artistParts(wanted)
  const candidateParts = artistParts(candidate)
  return (
    wantedParts.some((wp) =>
      candidateParts.some((cp) => wp === cp || wp.includes(cp) || cp.includes(wp)),
    ) ||
    candidateParts.some((cp) =>
      wantedParts.some((wp) => wp === cp || wp.includes(cp) || cp.includes(wp)),
    )
  )
}

export function metadataScore(
  lookup: LyricsLookup,
  title: string,
  artist: string,
  album?: string | null,
  duration?: number | null,
): number | null {
  if (!titleMatches(lookup.title, title) || !artistsMatch(lookup.artistString, artist)) {
    return null
  }

  const expectedDuration = lookup.durationSeconds
  if (
    expectedDuration != null &&
    expectedDuration > 0 &&
    duration != null &&
    duration > 0 &&
    Math.abs(expectedDuration - duration) > 12
  ) {
    return null
  }

  let score = 160
  if (titleKey(lookup.title) === titleKey(title)) score += 30

  if (lookup.album?.trim() && album?.trim() && titleMatches(lookup.album, album)) {
    score += 25
  }

  if (expectedDuration != null && duration != null) {
    const diff = Math.abs(expectedDuration - duration)
    if (diff <= 2) score += 30
    else if (diff <= 5) score += 20
    else score += 10
  }

  return score
}
