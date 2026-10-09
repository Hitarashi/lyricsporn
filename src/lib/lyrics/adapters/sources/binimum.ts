import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/domain/types'

import { metadataScore } from '@/lib/lyrics/domain/matching'

import { uriComponent } from './encoding'

const MIRROR_BASE_URLS = [
  'https://lyricsplus.prjktla.my.id',
  'https://lyricsplus.binimum.org',
  'https://lyricsplus.prjktla.workers.dev',
  'https://lyricsplus.atomix.one',
  'https://lyricsplus-seven.vercel.app',
]

interface LyricsPlusMetadata {
  source?: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  songISRC?: string
  songPlatformId?: string
}

interface LyricsPlusTtmlResponse {
  ttml?: string
  processingTime?: {
    winnerSource?: string
    selectedSongMetadata?: LyricsPlusMetadata
  }
}

interface LyricsPlusSyllable {
  text?: string
  time?: number
  duration?: number
}

interface LyricsPlusLine {
  text?: string
  time?: number
  duration?: number
  syllabus?: LyricsPlusSyllable[]
}

interface LyricsPlusJsonResponse {
  type?: string
  lyrics?: LyricsPlusLine[]
  metadata?: {
    source?: string
    selectedSongMetadata?: LyricsPlusMetadata
  }
}

function formatLrcTimestamp(timeMs: number, bracketed = true): string {
  const safeTime = Math.max(0, timeMs)
  const minutes = Math.floor(safeTime / 60000)
  const seconds = Math.floor((safeTime % 60000) / 1000)
  const millis = safeTime % 1000
  const centis = Math.floor(millis / 10)
  const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
  return bracketed ? `[${timestamp}]` : `<${timestamp}>`
}

function toLrc(response: LyricsPlusJsonResponse): { format: 'elrc' | 'lrc'; content: string } | null {
  const lines = response.lyrics
  if (!Array.isArray(lines) || lines.length === 0) return null

  const timedLines = lines.filter((l) => typeof l.time === 'number' && Number.isFinite(l.time))
  if (timedLines.length === 0) return null

  const isWord = response.type?.toLowerCase() === 'word'
  let hasWordTimings = false

  const text = timedLines
    .map((line) => {
      const lineTime = line.time ?? 0
      const syllables = (line.syllabus ?? []).filter(
        (s) => typeof s.text === 'string' && typeof s.time === 'number' && Number.isFinite(s.time),
      )

      if (isWord && syllables.length > 0) {
        hasWordTimings = true
        const wordText = syllables
          .map((s) => `${formatLrcTimestamp(s.time ?? 0, false)}${s.text ?? ''}`)
          .join('')
        return `${formatLrcTimestamp(lineTime, true)}${wordText}`
      }

      return `${formatLrcTimestamp(lineTime, true)}${line.text ?? ''}`
    })
    .join('\n')
    .trim()

  if (!text) return null
  return {
    format: hasWordTimings ? 'elrc' : 'lrc',
    content: text,
  }
}

export class BinimumLyricsSource implements LyricsSource {
  readonly id = 'binimum'
  readonly name = 'LyricsPlus (Binimum)'

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const query = this.buildQuery(input)

    for (const baseUrl of MIRROR_BASE_URLS) {
      try {
        const candidate = await this.fetchFromMirror(http, baseUrl, query, input)
        if (candidate) return [candidate]
      } catch {
        continue
      }
    }

    return []
  }

  private buildQuery(input: LyricsLookup): string {
    let q = `title=${uriComponent(input.title)}&artist=${uriComponent(input.artistString)}`
    if (input.album?.trim()) {
      q += `&album=${uriComponent(input.album.trim())}`
    }
    if (input.durationSeconds && input.durationSeconds > 0) {
      q += `&duration=${Math.round(input.durationSeconds)}`
    }
    return q
  }

  private async fetchFromMirror(
    http: LyricsHttpPort,
    baseUrl: string,
    query: string,
    input: LyricsLookup,
  ): Promise<LyricsCandidate | null> {
    // 1. Try v1/ttml/get
    const ttmlUrl = `${baseUrl}/v1/ttml/get?${query}`
    const ttmlRaw = await http.get(ttmlUrl)
    if (ttmlRaw) {
      const candidate = this.parseTtmlResponse(ttmlRaw, ttmlUrl, input)
      if (candidate) return candidate
    }

    // 2. Fallback to v2/lyrics/get
    const lyricsUrl = `${baseUrl}/v2/lyrics/get?${query}`
    const lyricsRaw = await http.get(lyricsUrl)
    if (lyricsRaw) {
      const candidate = this.parseJsonResponse(lyricsRaw, lyricsUrl, input)
      if (candidate) return candidate
    }

    return null
  }

  private parseTtmlResponse(
    raw: string,
    url: string,
    input: LyricsLookup,
  ): LyricsCandidate | null {
    const trimmed = raw.trim()
    if (trimmed.startsWith('<')) {
      return {
        document: { format: 'ttml', content: trimmed },
        provider: 'LyricsPlus (TTML)',
        sourceId: 'binimum',
        sourceUrl: url,
        weight: 30,
        metadataScore: 180,
      }
    }

    try {
      const data: LyricsPlusTtmlResponse = JSON.parse(raw)
      const ttml = data.ttml?.trim()
      if (!ttml || !ttml.startsWith('<')) return null

      const metadata = data.processingTime?.selectedSongMetadata
      const winnerSource = data.processingTime?.winnerSource
      const score = metadata
        ? metadataScore(
            input,
            metadata.title ?? input.title,
            metadata.artist ?? input.artistString,
            metadata.album,
            metadata.duration,
          )
        : null

      const provider = winnerSource
        ? `LyricsPlus (${winnerSource.toUpperCase()} TTML)`
        : 'LyricsPlus (TTML)'

      return {
        document: { format: 'ttml', content: ttml },
        provider,
        sourceId: 'binimum',
        sourceUrl: url,
        weight: 30,
        metadataScore: score ?? 180,
      }
    } catch {
      return null
    }
  }

  private parseJsonResponse(
    raw: string,
    url: string,
    input: LyricsLookup,
  ): LyricsCandidate | null {
    try {
      const data: LyricsPlusJsonResponse = JSON.parse(raw)
      const lrcResult = toLrc(data)
      if (!lrcResult) return null

      const metadata = data.metadata?.selectedSongMetadata
      const score = metadata
        ? metadataScore(
            input,
            metadata.title ?? input.title,
            metadata.artist ?? input.artistString,
            metadata.album,
            metadata.duration,
          )
        : null

      return {
        document: lrcResult,
        provider: `LyricsPlus (${lrcResult.format.toUpperCase()})`,
        sourceId: 'binimum',
        sourceUrl: url,
        weight: 25,
        metadataScore: score ?? 170,
      }
    } catch {
      return null
    }
  }
}

export const LyricsPlusLyricsSource = BinimumLyricsSource
