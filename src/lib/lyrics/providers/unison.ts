import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { convertTtml } from '@/lib/lyrics/parser/lyrics-parser'
import { formEncode } from '@/lib/lyrics/utils/string'

export class UnisonLyricsSource implements LyricsSource {
  readonly id = 'unison'
  readonly name = 'Unison'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    if (!input.title.trim() || !input.artistString.trim()) return []

    let url = `https://unison.boidu.dev/lyrics?song=${formEncode(input.title.trim())}&artist=${formEncode(input.artistString.trim())}`
    if (input.album?.trim()) {
      url += `&album=${formEncode(input.album.trim())}`
    }
    if (input.durationSeconds && input.durationSeconds > 0) {
      url += `&duration=${input.durationSeconds}`
    }

    const found = await this.candidate(http, url)
    if (found.length > 0) return found

    const videoId = input.youtubeVideoId?.trim()
    if (!videoId) return []
    return this.candidate(http, `https://unison.boidu.dev/lyrics?v=${formEncode(videoId)}`)
  }

  private async candidate(http: LyricsHttpPort, url: string): Promise<LyricsCandidate[]> {
    const raw = await http.get(url)
    if (!raw) return []

    try {
      const response = JSON.parse(raw)
      if (response.success === false) return []

      const data = response.data && typeof response.data === 'object' ? response.data : response
      const lyrics = typeof data.lyrics === 'string' ? data.lyrics : null
      if (!lyrics) return []

      const trimmedStart = lyrics.trimStart()
      const isTtml =
        data.format?.toLowerCase() === 'ttml' ||
        trimmedStart.startsWith('<tt') ||
        trimmedStart.startsWith('<?xml')

      const id = typeof data.id === 'string' && data.id ? data.id : 'unison'
      const attribution = 'Lyrics from Unison (https://unison.boidu.dev)'
      const ttml = isTtml ? lyrics : undefined
      const text = isTtml ? (convertTtml(lyrics, true) ?? convertTtml(lyrics) ?? lyrics) : lyrics

      return [
        {
          text,
          provider: isTtml ? 'Unison (TTML)' : 'Unison',
          sourceId: id,
          sourceUrl: url,
          weight: 22,
          ttmlRaw: ttml,
          attribution,
        },
      ]
    } catch {
      return []
    }
  }
}
