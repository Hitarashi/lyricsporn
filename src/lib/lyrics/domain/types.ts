export type LyricsFormat = 'elrc' | 'lrc' | 'plain'
export type LyricsSyncLevel = 'word' | 'line' | 'plain'

export interface LyricsWord {
  text: string
  startMs: number
  endMs?: number
}

export interface LyricsTranslation {
  language: string
  text: string
}

export interface LyricsLine {
  text: string
  startMs: number
  endMs: number
  words?: LyricsWord[]
  backgroundWords?: LyricsWord[]
  alignment?: string
  agent?: string
  singer?: string
  translations?: LyricsTranslation[]
  romanization?: string
  isInstrumental?: boolean
}

export type LyricsDocument =
  | {
      format: 'elrc' | 'lrc' | 'plain' | 'ttml' | 'krc' | 'qrc' | 'yrc' | 'richsync' | 'subtitles'
      content: string
    }
  | {
      format: 'structured'
      lines: LyricsLine[]
    }

export interface LyricsLookup {
  title: string
  artistString: string
  album?: string
  durationSeconds?: number
  appleTrackId?: string
  youtubeVideoId?: string
}

export interface LyricsCandidate {
  document: LyricsDocument
  provider: string
  sourceId: string
  sourceUrl?: string
  attribution?: string
  weight?: number
  metadataScore?: number
  instrumental?: boolean
}

export interface EvaluatedCandidate {
  candidate: LyricsCandidate
  score: number
  sourceIndex: number
  candidateIndex?: number
  tier?: LyricsSyncLevel
}

export interface LyricsResult {
  format: LyricsFormat
  syncLevel: LyricsSyncLevel
  plainText: string
  lines: LyricsLine[]
  provider: string | null
  sourceId?: string
  sourceUrl?: string
  attribution?: string
  instrumental?: boolean
}

export interface DetailedLyricsResult {
  result: LyricsResult
  candidates: EvaluatedCandidate[]
  winner: EvaluatedCandidate | null
  timingMs: Record<string, number>
  errors: Record<string, string>
  fromCache: boolean
}

export interface LyricsLookupOptions {
  timeoutMs?: number
  bypassCache?: boolean
  translateTo?: string
}
