import type { LyricsHttpPort, LyricsSource, LyricsTranslator } from '@/lib/lyrics/application/ports'
import type {
  DetailedLyricsResult,
  LyricsLookup,
  LyricsLookupOptions,
  LyricsResult,
} from '@/lib/lyrics/domain/types'

import { candidateToResult, createFallbackLyrics, rankCandidates } from './ranking'

const SOURCE_TIMEOUT_MS = 12_000
const CACHE_TTL_MS = 12 * 60 * 60 * 1000
const MAX_CACHE_ENTRIES = 256

interface CacheEntry {
  result: LyricsResult
  expiresAt: number
}

export interface LyricsRepositoryOptions {
  sources: LyricsSource[]
  http: LyricsHttpPort
  translator?: LyricsTranslator
  now?: () => number
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
  translator: LyricsTranslator | undefined,
): Promise<LyricsResult> {
  if (!targetLanguage || !translator || result.lines.length === 0) return result
  try {
    return {
      ...result,
      lines: await translator.translate(result.lines, targetLanguage),
    }
  } catch {
    return result
  }
}

export class LyricsRepository {
  private readonly sources: LyricsSource[]
  private readonly http: LyricsHttpPort
  private readonly translator?: LyricsTranslator
  private readonly cache = new Map<string, CacheEntry>()
  private readonly now: () => number

  constructor(options: LyricsRepositoryOptions) {
    this.sources = options.sources
    this.http = options.http
    this.translator = options.translator
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
      if (oldestKey) this.cache.delete(oldestKey)
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
          result: await translatedResult(cached, options.translateTo, this.translator),
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
    const timeoutMs = options.timeoutMs ?? SOURCE_TIMEOUT_MS

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
      } catch (error) {
        timingMs[source.id] = Date.now() - start
        controller.abort()
        const message = error instanceof Error ? error.message : String(error)
        errors[source.id] = [...new Set([...failedRequests, message])].join('; ')
        return []
      }
    })

    const sourceResults = await Promise.all(sourcePromises)
    const { candidates, winner } = rankCandidates(sourceResults.flat())
    let result = winner
      ? candidateToResult(winner.candidate, durationMs, track.artistString)
      : createFallbackLyrics(track, durationMs)

    if (winner && !options.bypassCache) this.putInCache(cacheKey, result)
    result = await translatedResult(result, options.translateTo, this.translator)

    return {
      result,
      candidates,
      winner,
      timingMs,
      errors,
      fromCache: false,
    }
  }
}
