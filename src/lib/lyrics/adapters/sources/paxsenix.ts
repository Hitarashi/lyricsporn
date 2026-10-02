import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type {
  LyricsCandidate,
  LyricsLine,
  LyricsLookup,
  LyricsWord,
} from '@/lib/lyrics/domain/types'

import { uriComponent } from './encoding'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parsePaxsenixWords(value: unknown): LyricsWord[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null

  const words: LyricsWord[] = []
  for (const wordValue of value) {
    if (!isRecord(wordValue) || typeof wordValue.text !== 'string') return null

    const startMs = finiteNumber(wordValue.timestamp)
    if (startMs === null) return null

    const endTime = finiteNumber(wordValue.endtime)
    const duration = finiteNumber(wordValue.duration)
    const endMs = endTime ?? (duration !== null ? startMs + duration : undefined)
    if (endMs !== undefined && endMs < startMs) return null

    words.push({
      text: wordValue.text,
      startMs,
      ...(endMs !== undefined ? { endMs } : {}),
    })
  }

  return words
}

function parsePaxsenixContent(value: unknown): LyricsLine[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const lines: LyricsLine[] = []
  for (const lineValue of value) {
    if (!isRecord(lineValue)) return null

    const words = parsePaxsenixWords(lineValue.text)
    const backgroundWords = parsePaxsenixWords(lineValue.backgroundText)
    if (!words || !backgroundWords) return null

    const startMs =
      finiteNumber(lineValue.timestamp) ??
      [...words, ...backgroundWords].reduce<number | null>(
        (earliest, word) => (earliest === null ? word.startMs : Math.min(earliest, word.startMs)),
        null,
      )
    if (startMs === null) return null

    const duration = finiteNumber(lineValue.duration)
    const wordEnd = [...words, ...backgroundWords].reduce<number | null>(
      (latest, word) =>
        word.endMs === undefined
          ? latest
          : latest === null
            ? word.endMs
            : Math.max(latest, word.endMs),
      null,
    )
    const endMs =
      finiteNumber(lineValue.endtime) ?? (duration !== null ? startMs + duration : wordEnd)
    if (endMs === null || endMs === undefined || endMs < startMs) return null

    const text = words.map((word) => word.text).join('')
    if (!text && words.length === 0 && backgroundWords.length === 0) return null

    lines.push({
      text,
      startMs,
      endMs,
      ...(words.length > 0 ? { words } : {}),
      ...(backgroundWords.length > 0 ? { backgroundWords } : {}),
      ...(typeof lineValue.agent === 'string' ? { agent: lineValue.agent } : {}),
    })
  }

  return lines.length > 0 ? lines : null
}

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
      const parsed: unknown = JSON.parse(raw)
      if (!isRecord(parsed)) return []

      const data = parsed
      const candidates: LyricsCandidate[] = []

      const structuredLines = parsePaxsenixContent(data.content)
      if (structuredLines) {
        candidates.push({
          document: { format: 'structured', lines: structuredLines },
          provider: 'Paxsenix Apple Music (JSON)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 35,
        })
      }

      if (data.elrc && typeof data.elrc === 'string') {
        candidates.push({
          document: { format: 'elrc', content: data.elrc },
          provider: 'Paxsenix Apple Music (ELRC)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 30,
        })
      }

      if (data.lrc && typeof data.lrc === 'string') {
        candidates.push({
          document: { format: 'lrc', content: data.lrc },
          provider: 'Paxsenix Apple Music (LRC)',
          sourceId: 'paxsenix',
          sourceUrl: url,
          weight: 25,
        })
      }

      if (data.plain && typeof data.plain === 'string') {
        candidates.push({
          document: { format: 'plain', content: data.plain },
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
