export type { FetchLyricsInput } from './adapters/server-functions'
export type {
  LyricsHttpPort,
  LyricsSource,
  LyricsTranslator,
} from './application/ports'
export type { LyricsRepositoryOptions } from './application/repository'
export type {
  DetailedLyricsResult,
  EvaluatedCandidate,
  LyricsCandidate,
  LyricsDocument,
  LyricsFormat,
  LyricsLine,
  LyricsLookup,
  LyricsLookupOptions,
  LyricsResult,
  LyricsSyncLevel,
  LyricsTranslation,
  LyricsWord,
} from './domain/types'
export type { ParsedLyrics, ParseLyricsOptions } from './parser'

export { defaultLyricsRepository } from './adapters/default-repository'
export { fetchDetailedLyricsServerFn, fetchLyricsServerFn } from './adapters/server-functions'
export { LyricsRepository } from './application/repository'
export { parseLyrics } from './parser'
