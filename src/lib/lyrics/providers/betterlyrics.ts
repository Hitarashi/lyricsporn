import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { convertTtml } from '@/lib/lyrics/parser/lyrics-parser'
import { uriComponent } from '@/lib/lyrics/utils/string'

export class BetterLyricsSource implements LyricsSource {
  readonly id = 'betterlyrics'
  readonly name = 'BetterLyrics'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const primary = await this.endpoint(http, input, 'getLyrics')
    if (primary.length > 0) return primary
    return this.endpoint(http, input, 'kugou/getLyrics')
  }

  private async endpoint(
    http: LyricsHttpPort,
    input: LyricsLookup,
    path: string,
  ): Promise<LyricsCandidate[]> {
    let url = `https://lyrics-api.boidu.dev/${path}?s=${uriComponent(input.title)}&a=${uriComponent(input.artistString)}`
    if (input.album?.trim()) {
      url += `&al=${uriComponent(input.album.trim())}`
    }
    if (input.durationSeconds && input.durationSeconds > 0) {
      url += `&d=${input.durationSeconds}`
    }

    const raw = await http.get(url)
    if (!raw) return []

    try {
      const data = JSON.parse(raw)
      const ttml = typeof data.ttml === 'string' ? data.ttml : null
      const candidates: LyricsCandidate[] = []

      if (ttml) {
        const converted = convertTtml(ttml, true)
        if (converted) {
          candidates.push({
            text: converted,
            provider: 'BetterLyrics (Word Synced)',
            sourceId: 'betterlyrics',
            sourceUrl: url,
            weight: 25,
            ttmlRaw: ttml,
          })
        }
      }

      if (data.lrc && typeof data.lrc === 'string') {
        candidates.push({
          text: data.lrc,
          provider: 'BetterLyrics (LRC)',
          sourceId: 'betterlyrics',
          sourceUrl: url,
          weight: 20,
          ttmlRaw: ttml ?? undefined,
        })
      }

      return candidates
    } catch {
      return []
    }
  }
}
