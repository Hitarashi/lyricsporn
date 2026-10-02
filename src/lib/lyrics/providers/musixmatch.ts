import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { parseTextLines } from '@/lib/lyrics/parser/lyrics-parser'
import { asEnhancedLrc, parseRichsync, parseSubtitles } from '@/lib/lyrics/parser/timed-formats'
import { formEncode, metadataScore } from '@/lib/lyrics/utils/string'

export class MusixmatchLyricsSource implements LyricsSource {
  readonly id = 'musixmatch'
  readonly name = 'Musixmatch'

  private readonly headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    Cookie: 'x-mxm-token-guid=',
  }

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const tokenUrl =
      'https://apic-desktop.musixmatch.com/ws/1.1/token.get?format=json&app_id=web-desktop-app-v1.0'
    const tokenRaw = await http.get(tokenUrl, this.headers)
    if (!tokenRaw) return []

    try {
      const tokenData = JSON.parse(tokenRaw)
      const token = tokenData?.message?.body?.user_token
      if (!token || typeof token !== 'string' || token.includes('UpgradeOnly')) {
        return []
      }

      const params = [
        'format=json',
        'namespace=lyrics_richsynched',
        'subtitle_format=mxm',
        'optional_calls=track.richsync',
        'app_id=web-desktop-app-v1.0',
        `usertoken=${formEncode(token)}`,
        `q_track=${formEncode(input.title)}`,
        `q_artist=${formEncode(input.artistString)}`,
      ]

      if (input.album?.trim()) {
        params.push(`q_album=${formEncode(input.album.trim())}`)
      }
      if (input.durationSeconds && input.durationSeconds > 0) {
        params.push(`q_duration=${input.durationSeconds}`)
      }

      const url = `https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?${params.join('&')}`
      const responseRaw = await http.get(url, this.headers)
      if (!responseRaw) return []

      const response = JSON.parse(responseRaw)
      const calls = response?.message?.body?.macro_calls
      if (!calls) return []

      const track = calls['matcher.track.get']?.message?.body?.track
      if (!track) return []

      const title = track.track_name ?? ''
      const artist = track.artist_name ?? ''
      const album = track.album_name
      const duration = track.track_length

      const metadata = metadataScore(input, title, artist, album, duration)
      if (metadata === null) return []

      const richsyncBody = calls['track.richsync.get']?.message?.body?.richsync?.richsync_body
      const richLines = typeof richsyncBody === 'string' ? parseRichsync(richsyncBody) : null

      const subtitleList = calls['track.subtitles.get']?.message?.body?.subtitle_list
      const subtitleBody = Array.isArray(subtitleList)
        ? subtitleList[0]?.subtitle?.subtitle_body
        : null

      const subtitleLines =
        typeof subtitleBody === 'string' ? parseSubtitles(subtitleBody, parseTextLines) : null

      const structured =
        richLines && richLines.length > 0
          ? richLines
          : subtitleLines && subtitleLines.length > 0
            ? subtitleLines
            : null

      if (!structured) return []

      const publicUrl = new URL(url)
      publicUrl.searchParams.delete('usertoken')

      return [
        {
          text: asEnhancedLrc(structured),
          provider: 'Musixmatch',
          sourceId: 'musixmatch',
          sourceUrl: publicUrl.toString(),
          weight: 20,
          metadataScore: metadata,
          structuredLines: structured,
        },
      ]
    } catch {
      return []
    }
  }
}
