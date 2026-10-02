import type { LyricsSource } from './providers/types'
import type {
  DetailedLyricsResult,
  EvaluatedCandidate,
  LyricsCandidate,
  LyricsLookup,
  LyricsLookupOptions,
  LyricsResult,
} from './types'

import { LyricsHttp, type LyricsHttpPort } from './http'
import { fromText } from './parser/lyrics-parser'
import { createDefaultProviders } from './providers/index'
import { translateLyricsLines } from './utils/translation'

const PROVIDER_TIMEOUT_MS = 12000
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 256

export function scoreCandidate(candidate: LyricsCandidate): number {
  if (!candidate.text && !candidate.ttmlRaw && !candidate.structuredLines) {
    return 0
  }

  const parsed = fromText(candidate.text ?? '', 0, {
    ttmlRaw: candidate.ttmlRaw,
    structuredLines: candidate.structuredLines,
  })

  let tierScore = 0
  if (parsed.syncLevel === 'word') {
    tierScore = 1000
  } else if (parsed.syncLevel === 'line') {
    tierScore = 500
  } else {
    tierScore = 100
  }

  const cleanText = parsed.plainText.trim()
  if (cleanText.length < 10 || parsed.lines.length < 2) {
    return 0
  }

  const weight = candidate.weight ?? 0
  const meta = candidate.metadataScore ?? 0

  return tierScore + weight + meta
}

function candidateToResult(
  candidate: LyricsCandidate,
  durationMs: number,
  mainArtist?: string | null,
): LyricsResult {
  const parsed = fromText(candidate.text ?? '', durationMs, {
    ttmlRaw: candidate.ttmlRaw,
    structuredLines: candidate.structuredLines,
    mainArtist,
  })

  return {
    ...parsed,
    provider: candidate.provider,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    attribution: candidate.attribution,
    ttmlRaw: candidate.ttmlRaw,
    instrumental: candidate.instrumental,
  }
}

function cloneLyricsResult(result: LyricsResult): LyricsResult {
  return {
    ...result,
    lines: result.lines.map((line) => ({
      ...line,
      words: line.words?.map((word) => ({ ...word })),
      backgroundWords: line.backgroundWords?.map((word) => ({ ...word })),
      translations: line.translations?.map((translation) => ({ ...translation })),
    })),
  }
}

function createFallbackLyrics(lookup: LyricsLookup, durationMs: number = 0): LyricsResult {
  const title = lookup.title ? lookup.title.trim() : 'Instrumental'
  const artist = lookup.artistString ? lookup.artistString.trim() : ''
  const text = artist ? `${title}\n${artist}` : title
  const lines = [
    {
      text,
      startMs: 0,
      endMs: durationMs > 0 ? durationMs : 5000,
    },
  ]

  return {
    lines,
    plainText: text,
    syncLevel: 'plain',
    format: 'plain',
    provider: 'Fallback',
    sourceId: 'fallback',
  }
}

function createScopedHttp(
  http: LyricsHttpPort,
  signal: AbortSignal,
  failedRequests: string[],
): LyricsHttpPort {
  const failureLabel = (method: string, url: string) => {
    try {
      const parsed = new URL(url)
      return `${method} ${parsed.origin}${parsed.pathname} failed`
    } catch {
      return `${method} request failed`
    }
  }

  return {
    async get(url, headers) {
      const response = await http.get(url, headers, signal)
      if (response === null && !signal.aborted) failedRequests.push(failureLabel('GET', url))
      return response
    },
    async postJson(url, body, headers) {
      const response = await http.postJson(url, body, headers, signal)
      if (response === null && !signal.aborted) failedRequests.push(failureLabel('POST', url))
      return response
    },
  }
}

async function translatedResult(
  result: LyricsResult,
  targetLanguage: string | undefined,
  http: LyricsHttpPort,
): Promise<LyricsResult> {
  if (!targetLanguage || result.lines.length === 0) return result
  try {
    return {
      ...result,
      lines: await translateLyricsLines(result.lines, targetLanguage, http),
    }
  } catch {
    return result
  }
}

interface CacheEntry {
  result: LyricsResult
  expiresAt: number
}

export interface LyricsRepositoryOptions {
  sources?: LyricsSource[]
  http?: LyricsHttpPort
  now?: () => number
}

export class LyricsRepository {
  private sources: LyricsSource[]
  private http: LyricsHttpPort
  private cache = new Map<string, CacheEntry>()
  private now: () => number

  constructor(options: LyricsRepositoryOptions = {}) {
    this.http = options.http ?? new LyricsHttp()
    this.sources = options.sources ?? createDefaultProviders()
    this.now = options.now ?? Date.now
  }

  private makeCacheKey(lookup: LyricsLookup): string {
    return JSON.stringify([
      lookup.title.trim().toLowerCase(),
      lookup.artistString.trim().toLowerCase(),
      lookup.album?.trim().toLowerCase() ?? '',
      lookup.durationSeconds ?? 0,
      lookup.appleTrackId?.trim() ?? '',
      lookup.youtubeVideoId?.trim() ?? '',
    ])
  }

  private getFromCache(key: string): LyricsResult | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (this.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    this.cache.delete(key)
    this.cache.set(key, entry)
    return cloneLyricsResult(entry.result)
  }

  private putInCache(key: string, result: LyricsResult): void {
    if (!this.cache.has(key) && this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
    this.cache.set(key, {
      result: cloneLyricsResult(result),
      expiresAt: this.now() + CACHE_TTL_MS,
    })
  }

  async lookup(track: LyricsLookup, options: LyricsLookupOptions = {}): Promise<LyricsResult> {
    const detailed = await this.lookupDetailed(track, options)
    return detailed.result
  }

  async lookupDetailed(
    track: LyricsLookup,
    options: LyricsLookupOptions = {},
  ): Promise<DetailedLyricsResult> {
    const durationSeconds = Number.isFinite(track.durationSeconds)
      ? Math.max(0, track.durationSeconds ?? 0)
      : 0
    const durationMs = Math.round(durationSeconds * 1000)
    const cacheKey = this.makeCacheKey(track)

    if (!track.title.trim() || !track.artistString.trim()) {
      return {
        result: createFallbackLyrics(track, durationMs),
        candidates: [],
        winner: null,
        timingMs: {},
        errors: {},
        fromCache: false,
      }
    }

    if (!options.bypassCache) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return {
          result: await translatedResult(cached, options.translateTo, this.http),
          candidates: [],
          winner: null,
          timingMs: {},
          errors: {},
          fromCache: true,
        }
      }
    }

    const timingMs: Record<string, number> = {}
    const errors: Record<string, string> = {}
    const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS

    const sourcePromises = this.sources.map(async (source, sourceIndex) => {
      const start = Date.now()
      const controller = new AbortController()
      const failedRequests: string[] = []
      const scopedHttp = createScopedHttp(this.http, controller.signal, failedRequests)
      try {
        let timer: ReturnType<typeof setTimeout> | null = null
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort()
            reject(new Error(`Timeout after ${timeoutMs}ms`))
          }, timeoutMs)
        })

        const candidates = await Promise.race([
          source.lookup(scopedHttp, track),
          timeoutPromise,
        ]).finally(() => {
          if (timer) clearTimeout(timer)
        })

        timingMs[source.id] = Date.now() - start
        if (candidates.length === 0 && failedRequests.length > 0) {
          errors[source.id] = [...new Set(failedRequests)].join('; ')
        }

        return candidates.map((candidate, candidateIndex) => ({
          candidate,
          sourceIndex,
          candidateIndex,
        }))
      } catch (err) {
        timingMs[source.id] = Date.now() - start
        controller.abort()
        const message = err instanceof Error ? err.message : String(err)
        errors[source.id] = [...new Set([...failedRequests, message])].join('; ')
        return []
      }
    })

    const allSourceResults = await Promise.all(sourcePromises)
    const flattened = allSourceResults.flat()

    const evaluatedCandidates: EvaluatedCandidate[] = flattened.map(
      ({ candidate, sourceIndex, candidateIndex }) => {
        const score = scoreCandidate(candidate)
        return {
          candidate,
          score,
          sourceIndex,
          candidateIndex,
        }
      },
    )

    const validCandidates = evaluatedCandidates
      .filter((c) => c.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score
        }
        if (a.sourceIndex !== b.sourceIndex) {
          return a.sourceIndex - b.sourceIndex
        }
        const aCandIdx = a.candidateIndex ?? 0
        const bCandIdx = b.candidateIndex ?? 0
        return aCandIdx - bCandIdx
      })

    const winner = validCandidates[0] ?? null
    let result: LyricsResult
    if (winner) {
      result = candidateToResult(winner.candidate, durationMs, track.artistString)
      if (!options.bypassCache) {
        this.putInCache(cacheKey, result)
      }
    } else {
      result = createFallbackLyrics(track, durationMs)
    }

    result = await translatedResult(result, options.translateTo, this.http)

    return {
      result,
      candidates: evaluatedCandidates,
      winner,
      timingMs,
      errors,
      fromCache: false,
    }
  }
}

export const defaultLyricsRepository = new LyricsRepository()
