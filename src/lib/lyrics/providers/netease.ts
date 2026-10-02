import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { parseTextLines } from '@/lib/lyrics/parser/lyrics-parser'
import { asEnhancedLrc, parseYrc } from '@/lib/lyrics/parser/timed-formats'
import { formEncode, metadataScore } from '@/lib/lyrics/utils/string'

interface SongArtist {
  name?: string
}

interface SongItem {
  id?: number | string
  name?: string
  artists?: SongArtist[]
  album?: { name?: string }
  duration?: number
}

interface ScoredNetEaseSong {
  song: SongItem
  score: number
  artists: string
  duration: number | null
}

export class NetEaseLyricsSource implements LyricsSource {
  readonly id = 'netease'
  readonly name = 'NetEase Cloud Music'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const headers = { Referer: 'https://music.163.com' }
    const searchUrl = `https://music.163.com/api/search/get?s=${formEncode(`${input.title} ${input.artistString}`)}&type=1&limit=8`
    const rawSearch = await http.get(searchUrl, headers)
    if (!rawSearch) return []

    try {
      const searchData = JSON.parse(rawSearch)
      const songs: SongItem[] = Array.isArray(searchData?.result?.songs)
        ? searchData.result.songs
        : []

      const matches: ScoredNetEaseSong[] = songs
        .map((song: SongItem): ScoredNetEaseSong | null => {
          const title = song.name
          if (!title) return null
          const artists = (song.artists ?? [])
            .map((a) => a.name)
            .filter((n): n is string => Boolean(n))
            .join(', ')
          const duration = song.duration ? Math.round(song.duration / 1000) : null
          const score = metadataScore(input, title, artists, null, duration)
          if (score === null) return null
          return { song, score, artists, duration }
        })
        .filter((x): x is ScoredNetEaseSong => x !== null)
        .sort((a: ScoredNetEaseSong, b: ScoredNetEaseSong) => b.score - a.score)
        .slice(0, 3)

      for (const { song, artists, duration } of matches) {
        const id = song.id
        if (!id) continue

        const lyricUrl = `https://music.163.com/api/song/lyric/v1?id=${id}&cp=false&lv=0&tv=0&rv=0&kv=0&yv=0&ytv=0&yrv=0`
        const rawSheet = await http.get(lyricUrl, headers)
        if (!rawSheet) continue

        const sheet = JSON.parse(rawSheet)
        const yrc = typeof sheet.yrc?.lyric === 'string' ? sheet.yrc.lyric : null
        const lrc = typeof sheet.lrc?.lyric === 'string' ? sheet.lrc.lyric : null

        const yrcLines = yrc ? parseYrc(yrc) : null
        const structured =
          yrcLines && yrcLines.length > 0 ? yrcLines : lrc ? parseTextLines(lrc) : null

        if (!structured || structured.length === 0) continue

        const matchScore = metadataScore(
          input,
          song.name ?? '',
          artists,
          song.album?.name,
          duration,
        )
        if (matchScore === null) continue

        return [
          {
            text: asEnhancedLrc(structured),
            provider: 'NetEase (YRC/LRC)',
            sourceId: `netease:${id}`,
            sourceUrl: lyricUrl,
            weight: 10,
            metadataScore: matchScore,
            structuredLines: structured,
          },
        ]
      }

      return []
    } catch {
      return []
    }
  }
}
