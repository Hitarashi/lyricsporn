import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { convertTtml } from '@/lib/lyrics/parser/lyrics-parser'
import { metadataScore, uriComponent } from '@/lib/lyrics/utils/string'

interface BinimumItem {
  track_name?: string
  artist_name?: string
  album_name?: string
  duration?: number
  lyricsUrl?: string
  timing_type?: string
}

interface ScoredBinimumItem {
  item: BinimumItem
  score: number
  timingType: string
}

export class BinimumLyricsSource implements LyricsSource {
  readonly id = 'binimum'
  readonly name = 'Binimum'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    let url = `https://lyrics-api.binimum.org/?track=${uriComponent(input.title)}&artist=${uriComponent(input.artistString)}`
    if (input.album?.trim()) {
      url += `&album=${uriComponent(input.album.trim())}`
    }
    if (input.durationSeconds && input.durationSeconds > 0) {
      url += `&duration=${input.durationSeconds}`
    }

    const raw = await http.get(url)
    if (!raw) return []

    try {
      const data = JSON.parse(raw)
      const results: BinimumItem[] = Array.isArray(data.results) ? data.results : []

      const items: ScoredBinimumItem[] = results
        .map((item: BinimumItem): ScoredBinimumItem | null => {
          const title = item.track_name
          const artist = item.artist_name
          if (!title || !artist) return null
          const score = metadataScore(input, title, artist, null, item.duration)
          if (score === null) return null
          return { item, score, timingType: item.timing_type ?? '' }
        })
        .filter((item): item is ScoredBinimumItem => item !== null)
        .sort((left, right) => {
          const leftWord = /^(word|syllable)$/i.test(left.timingType)
          const rightWord = /^(word|syllable)$/i.test(right.timingType)
          if (leftWord !== rightWord) return leftWord ? -1 : 1
          return right.score - left.score
        })

      for (const { item } of items) {
        const sheetUrl = item.lyricsUrl
        if (!sheetUrl?.startsWith('https://')) continue

        const ttml = await http.get(sheetUrl)
        if (!ttml) continue

        const score = metadataScore(
          input,
          item.track_name ?? '',
          item.artist_name ?? '',
          item.album_name,
          item.duration,
        )
        if (score === null) continue

        const text = convertTtml(ttml, true) ?? convertTtml(ttml)
        if (!text) continue

        return [
          {
            text,
            provider: 'Apple Music (Binimum TTML)',
            sourceId: 'binimum',
            sourceUrl: sheetUrl,
            weight: 10,
            metadataScore: score,
            ttmlRaw: ttml,
          },
        ]
      }

      return []
    } catch {
      return []
    }
  }
}
