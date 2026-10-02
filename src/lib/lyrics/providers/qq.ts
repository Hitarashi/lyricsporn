import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { parseTextLines } from '@/lib/lyrics/parser/lyrics-parser'
import { asEnhancedLrc, parseQrc } from '@/lib/lyrics/parser/timed-formats'
import { decodeBase64OrRaw, decryptQrc } from '@/lib/lyrics/utils/crypto'
import { formEncode, metadataScore } from '@/lib/lyrics/utils/string'
import { extractQrcXmlContent } from '@/lib/lyrics/utils/xml'

interface SingerItem {
  name?: string
}

interface SongItem {
  songname?: string
  songmid?: string
  singer?: SingerItem[]
  albumname?: string
  interval?: number
}

interface ScoredQqSong {
  song: SongItem
  score: number
  artists: string
  duration: number | null
}

export class QqMusicLyricsSource implements LyricsSource {
  readonly id = 'qq'
  readonly name = 'QQ Music'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const headers = { Referer: 'https://y.qq.com/' }
    const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=10&w=${formEncode(`${input.title} ${input.artistString}`)}`
    const rawSearch = await http.get(searchUrl, headers)
    if (!rawSearch) return []

    try {
      const searchData = JSON.parse(rawSearch)
      const songs: SongItem[] = Array.isArray(searchData?.data?.song?.list)
        ? searchData.data.song.list
        : []

      const matches: ScoredQqSong[] = songs
        .map((song: SongItem): ScoredQqSong | null => {
          const title = song.songname
          if (!title) return null
          const artists = (song.singer ?? [])
            .map((s) => s.name)
            .filter((n): n is string => Boolean(n))
            .join(', ')
          const duration = song.interval ?? null
          const score = metadataScore(input, title, artists, null, duration)
          if (score === null) return null
          return { song, score, artists, duration }
        })
        .filter((x): x is ScoredQqSong => x !== null)
        .sort((a: ScoredQqSong, b: ScoredQqSong) => b.score - a.score)
        .slice(0, 3)

      for (const { song, artists, duration } of matches) {
        const mid = song.songmid
        if (!mid) continue

        const lyricUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${formEncode(mid)}&format=json&nobase64=0`
        const rawSheet = await http.get(lyricUrl, headers)
        if (!rawSheet) continue

        const sheet = JSON.parse(rawSheet)
        const encoded = sheet?.qrc ?? sheet?.lyric
        if (!encoded || typeof encoded !== 'string') continue

        const decoded = decodeBase64OrRaw(encoded)
        if (!decoded) continue

        const raw = extractQrcXmlContent(decoded) ?? decoded
        const decrypted = decryptQrc(raw)

        const structured =
          (decrypted ? parseQrc(decrypted) : null)?.filter((l) => l.startMs > 0) ??
          parseQrc(raw).filter((l) => l.startMs > 0)

        const finalLines =
          structured.length > 0 ? structured : parseTextLines(raw).filter((l) => l.startMs > 0)

        if (finalLines.length === 0) continue

        const matchScore = metadataScore(
          input,
          song.songname ?? '',
          artists,
          song.albumname,
          duration,
        )
        if (matchScore === null) continue

        return [
          {
            text: asEnhancedLrc(finalLines),
            provider: 'QQ Music (QRC)',
            sourceId: `qq:${mid}`,
            sourceUrl: lyricUrl,
            weight: 10,
            metadataScore: matchScore,
            structuredLines: finalLines,
          },
        ]
      }

      return []
    } catch {
      return []
    }
  }
}
