import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/domain/types'

import { metadataScore } from '@/lib/lyrics/domain/matching'

import { uriComponent } from './encoding'

interface AmllEntry {
  title: string
  artists: string[]
  album?: string
  ncmId?: string
  file: string
}

function parseEntry(raw: string): AmllEntry | null {
  try {
    const item = JSON.parse(raw)
    const metadata = item.metadata
    if (!Array.isArray(metadata)) return null

    const values = new Map<string, string[]>()
    for (const pair of metadata) {
      if (!Array.isArray(pair) || pair.length < 2) continue
      const key = String(pair[0])
      const array = pair[1]
      if (!Array.isArray(array)) continue
      values.set(key, array.map((x) => String(x).trim()).filter(Boolean))
    }

    const title = values.get('musicName')?.[0]
    const file = typeof item.rawLyricFile === 'string' ? item.rawLyricFile : null
    if (!title || !file) return null

    return {
      title,
      artists: values.get('artists') ?? [],
      album: values.get('album')?.[0],
      ncmId: values.get('ncmMusicId')?.[0],
      file,
    }
  } catch {
    return null
  }
}

export class AmllTtmlDbSource implements LyricsSource {
  readonly id = 'amll-ttml-db'
  readonly name = 'AMLL TTML Database'

  private cachedIndex: AmllEntry[] | null = null

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const indexUrl =
      'https://raw.githubusercontent.com/amll-dev/amll-ttml-db/refs/heads/main/metadata/raw-lyrics-index.jsonl'

    let entries = this.cachedIndex
    if (!entries) {
      const loaded = await http.get(indexUrl)
      if (!loaded) return []
      const parsed = loaded
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map(parseEntry)
        .filter((e): e is AmllEntry => e !== null)
      if (parsed.length === 0) return []
      this.cachedIndex = parsed
      entries = parsed
    }

    let bestEntry: AmllEntry | null = null
    let highestScore = -1

    for (const item of entries) {
      const score = metadataScore(input, item.title, item.artists.join(', '), item.album)
      if (score !== null && score > highestScore) {
        highestScore = score
        bestEntry = item
      }
    }

    if (!bestEntry) return []

    const url = `https://raw.githubusercontent.com/amll-dev/amll-ttml-db/refs/heads/main/raw-lyrics/${uriComponent(bestEntry.file)}`
    const ttml = await http.get(url)
    if (!ttml) return []

    return [
      {
        document: { format: 'ttml', content: ttml },
        provider: 'AMLL TTML Database',
        sourceId: bestEntry.ncmId ?? 'amll-ttml-db',
        sourceUrl: url,
        weight: 10,
        metadataScore: highestScore,
      },
    ]
  }
}
