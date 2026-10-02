import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/domain/types'

import { uriComponent } from './encoding'

type JsonRecord = Record<string, unknown>

const MAX_RESPONSE_UNWRAP_DEPTH = 6
const RESPONSE_FIELDS = ['ttml', 'lyrics', 'data', 'result', 'response'] as const
const TTML_ROOT =
  /^\s*(?:<\?xml\b[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[A-Za-z_][\w.-]*:)?tt(?=\s|>)/iu
const LRC_TIMESTAMP = /^\s*\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/mu

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseNestedJson(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function findTtml(value: unknown, depth = 0): string | null {
  if (depth > MAX_RESPONSE_UNWRAP_DEPTH) return null
  if (typeof value === 'string') {
    const content = value.replace(/^\uFEFF/u, '').trim()
    if (TTML_ROOT.test(content)) return content
    if (depth === MAX_RESPONSE_UNWRAP_DEPTH) return null
    return findTtml(parseNestedJson(content), depth + 1)
  }
  if (!isRecord(value)) return null

  for (const field of RESPONSE_FIELDS) {
    if (value[field] === undefined) continue
    const content = findTtml(value[field], depth + 1)
    if (content) return content
  }
  return null
}

function findLrc(value: unknown, depth = 0): string | null {
  if (depth > MAX_RESPONSE_UNWRAP_DEPTH) return null
  if (typeof value === 'string') {
    const content = value.replace(/^\uFEFF/u, '').trim()
    if (LRC_TIMESTAMP.test(content)) return content
    if (depth === MAX_RESPONSE_UNWRAP_DEPTH) return null
    return findLrc(parseNestedJson(content), depth + 1)
  }
  if (!isRecord(value)) return null

  if (typeof value.lrc === 'string' && value.lrc.trim()) return value.lrc.trim()
  for (const field of ['lyrics', 'data', 'result', 'response'] as const) {
    if (value[field] === undefined) continue
    const content = findLrc(value[field], depth + 1)
    if (content) return content
  }
  return null
}

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

    const ttml = findTtml(raw)
    const lrc = findLrc(raw)
    const candidates: LyricsCandidate[] = []

    if (ttml) {
      candidates.push({
        document: { format: 'ttml', content: ttml },
        provider: 'BetterLyrics (TTML)',
        sourceId: 'betterlyrics',
        sourceUrl: url,
        weight: 25,
      })
    }

    if (lrc) {
      candidates.push({
        document: { format: 'lrc', content: lrc },
        provider: 'BetterLyrics (LRC)',
        sourceId: 'betterlyrics',
        sourceUrl: url,
        weight: 20,
      })
    }

    return candidates
  }
}
