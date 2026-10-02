import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'
import type { LyricsSource } from './types'

import { asEnhancedLrc, parseKrc } from '@/lib/lyrics/parser/timed-formats'
import { decryptKrc } from '@/lib/lyrics/utils/crypto'
import { formEncode, metadataScore, uriComponent } from '@/lib/lyrics/utils/string'

interface SongItem {
  songname?: string
  singername?: string
  album_name?: string
  duration?: number
  hash?: string
}

interface ScoredKugouSong {
  song: SongItem
  score: number
  duration: number
}

interface CandidateItem {
  id?: string
  accesskey?: string
  krctype?: number
}

export class KugouLyricsSource implements LyricsSource {
  readonly id = 'kugou'
  readonly name = 'Kugou'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const searchUrl = `https://mobiles.kugou.com/api/v3/search/song?format=json&keyword=${uriComponent(`${input.title} ${input.artistString}`)}&page=1&pagesize=20&showtype=1`
    const rawSearch = await http.get(searchUrl)
    if (!rawSearch) return []

    try {
      const searchData = JSON.parse(rawSearch)
      const songs: SongItem[] = Array.isArray(searchData?.data?.info) ? searchData.data.info : []

      const matches: ScoredKugouSong[] = songs
        .map((song: SongItem): ScoredKugouSong | null => {
          const title = song.songname
          const artist = song.singername
          if (!title || !artist) return null
          const duration = song.duration
          const score = metadataScore(input, title, artist, null, duration)
          if (score === null) return null
          return { song, score, duration: duration ?? 0 }
        })
        .filter((x): x is ScoredKugouSong => x !== null)
        .sort((a: ScoredKugouSong, b: ScoredKugouSong) => b.score - a.score)
        .slice(0, 4)

      for (const { song, duration } of matches) {
        const hash = song.hash
        if (!hash) continue

        const indexUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=mobi&hash=${formEncode(hash)}&duration=${duration * 1000}`
        const rawIndex = await http.get(indexUrl)
        if (!rawIndex) continue

        const indexData = JSON.parse(rawIndex)
        const candidates: CandidateItem[] = Array.isArray(indexData?.candidates)
          ? indexData.candidates
          : []

        const ordered = candidates
          .filter((c: CandidateItem) => Boolean(c.id && c.accesskey))
          .sort((a: CandidateItem, b: CandidateItem) => {
            const aKrc = a.krctype === 2 ? 1 : 0
            const bKrc = b.krctype === 2 ? 1 : 0
            return bKrc - aKrc
          })
          .slice(0, 3)

        for (const lyricCandidate of ordered) {
          const id = lyricCandidate.id
          const accessKey = lyricCandidate.accesskey
          if (!id || !accessKey) continue

          const sheetUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${formEncode(id)}&accesskey=${formEncode(accessKey)}&fmt=krc&charset=utf8`
          const rawSheet = await http.get(sheetUrl)
          if (!rawSheet) continue

          const sheetData = JSON.parse(rawSheet)
          const encoded = sheetData?.content
          if (!encoded || typeof encoded !== 'string') continue

          const decrypted = decryptKrc(encoded)
          if (!decrypted) continue

          const lines = parseKrc(decrypted)
          if (lines.length === 0) continue

          const matchScore = metadataScore(
            input,
            song.songname ?? '',
            song.singername ?? '',
            song.album_name,
            duration,
          )
          if (matchScore === null) continue

          return [
            {
              text: asEnhancedLrc(lines),
              provider: 'Kugou KRC',
              sourceId: `kugou:${id}`,
              sourceUrl: sheetUrl,
              weight: 10,
              metadataScore: matchScore,
              structuredLines: lines,
            },
          ]
        }
      }

      return []
    } catch {
      return []
    }
  }
}
