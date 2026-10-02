import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { formEncode } from '@/lib/lyrics/utils/string'

function simpleKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function lrclibMetadataMatches(
  input: LyricsLookup,
  title: string,
  artist: string,
  duration?: number | null,
): boolean {
  const wantedTitle = simpleKey(input.title)
  const foundTitle = simpleKey(title)
  const wantedArtist = simpleKey(input.artistString)
  const foundArtist = simpleKey(artist)

  if (!wantedTitle || !foundTitle) return false
  if (
    foundTitle !== wantedTitle &&
    !foundTitle.includes(wantedTitle) &&
    !wantedTitle.includes(foundTitle)
  ) {
    return false
  }

  if (!wantedArtist || !foundArtist) return false
  if (
    foundArtist !== wantedArtist &&
    !foundArtist.includes(wantedArtist) &&
    !wantedArtist.includes(foundArtist)
  ) {
    return false
  }

  if (
    input.durationSeconds != null &&
    duration != null &&
    Math.abs(input.durationSeconds - duration) > 12
  ) {
    return false
  }

  return true
}

export class LrclibLyricsSource implements LyricsSource {
  readonly id = 'lrclib'
  readonly name = 'LRCLIB'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const [exactResults, searchResults] = await Promise.all([
      this.exact(http, input),
      this.search(http, input),
    ])
    return [...exactResults, ...searchResults]
  }

  private async exact(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const queryParts = [
      `artist_name=${formEncode(input.artistString)}`,
      `track_name=${formEncode(input.title)}`,
    ]
    if (input.album?.trim()) {
      queryParts.push(`album_name=${formEncode(input.album.trim())}`)
    }
    if (input.durationSeconds && input.durationSeconds > 0) {
      queryParts.push(`duration=${input.durationSeconds}`)
    }

    const url = `https://lrclib.net/api/get?${queryParts.join('&')}`
    const raw = await http.get(url)
    if (!raw) return []

    try {
      const data = JSON.parse(raw)
      const candidates: LyricsCandidate[] = []
      if (data.syncedLyrics && typeof data.syncedLyrics === 'string') {
        candidates.push({
          text: data.syncedLyrics,
          provider: 'LRCLIB Exact (LRC)',
          sourceId: 'lrclib',
          sourceUrl: url,
          weight: 15,
        })
      }
      if (data.plainLyrics && typeof data.plainLyrics === 'string') {
        candidates.push({
          text: data.plainLyrics,
          provider: 'LRCLIB Exact (Plain)',
          sourceId: 'lrclib',
          sourceUrl: url,
          weight: 10,
        })
      }
      return candidates
    } catch {
      return []
    }
  }

  private async search(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const url = `https://lrclib.net/api/search?q=${formEncode(`${input.title} ${input.artistString}`)}`
    const raw = await http.get(url)
    if (!raw) return []

    try {
      const results = JSON.parse(raw)
      if (!Array.isArray(results)) return []

      interface LrclibItem {
        trackName?: string
        artistName?: string
        duration?: number
        syncedLyrics?: string
        plainLyrics?: string
      }

      const matches = results
        .filter((item: LrclibItem) => {
          if (!item.trackName || !item.artistName) return false
          return lrclibMetadataMatches(input, item.trackName, item.artistName, item.duration)
        })
        .sort((a: LrclibItem, b: LrclibItem) => {
          const durA = a.duration ?? 0
          const durB = b.duration ?? 0
          const target = input.durationSeconds ?? durA
          return Math.abs(target - durA) - Math.abs(target - durB)
        })

      const candidates: LyricsCandidate[] = []
      for (const item of matches) {
        if (item.syncedLyrics) {
          candidates.push({
            text: item.syncedLyrics,
            provider: 'LRCLIB Search (LRC)',
            sourceId: 'lrclib',
            sourceUrl: url,
            weight: 5,
          })
        }
        if (item.plainLyrics) {
          candidates.push({
            text: item.plainLyrics,
            provider: 'LRCLIB Search (Plain)',
            sourceId: 'lrclib',
            sourceUrl: url,
            weight: 0,
          })
        }
      }
      return candidates
    } catch {
      return []
    }
  }
}
