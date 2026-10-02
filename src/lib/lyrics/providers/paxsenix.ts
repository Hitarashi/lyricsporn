import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { convertTtml } from '@/lib/lyrics/parser/lyrics-parser'
import { uriComponent } from '@/lib/lyrics/utils/string'

export class PaxsenixLyricsSource implements LyricsSource {
  readonly id = 'paxsenix'
  readonly name = 'Paxsenix Apple Music'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const appleId = input.appleTrackId?.trim()
    if (!appleId) return []

    const url = `https://lyrics.paxsenix.org/apple-music/lyrics?id=${uriComponent(appleId)}`
    const raw = await http.get(url)
    if (!raw) return []

    try {
      const data = JSON.parse(raw)
      const ttml = typeof data.ttmlContent === 'string' ? data.ttmlContent : null
      const converted = ttml ? convertTtml(ttml, true) : null

      const candidates: LyricsCandidate[] = []

      if (data.elrc && typeof data.elrc === 'string') {
        candidates.push({
          text: data.elrc,
          provider: 'Paxsenix Apple Music (ELRC)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 30,
          ttmlRaw: ttml ?? undefined,
        })
      }

      if (converted) {
        candidates.push({
          text: converted,
          provider: 'Paxsenix Apple Music (TTML-ELRC)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 30,
          ttmlRaw: ttml ?? undefined,
        })
      }

      if (data.lrc && typeof data.lrc === 'string') {
        candidates.push({
          text: data.lrc,
          provider: 'Paxsenix Apple Music (LRC)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 25,
          ttmlRaw: ttml ?? undefined,
        })
      }

      if (data.plain && typeof data.plain === 'string') {
        candidates.push({
          text: data.plain,
          provider: 'Paxsenix Apple Music (Plain)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 20,
        })
      }

      return candidates
    } catch {
      return []
    }
  }
}
