import type { LyricsCandidate, LyricsLine, LyricsLookup } from '@/lib/lyrics/domain/types'

export interface LyricsHttpPort {
  get(url: string, headers?: Record<string, string>, signal?: AbortSignal): Promise<string | null>
  postJson(
    url: string,
    body: string,
    headers?: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<string | null>
}

export interface LyricsSource {
  readonly id: string
  readonly name: string
  lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]>
}

export interface LyricsTranslator {
  translate(lines: LyricsLine[], targetLanguage: string): Promise<LyricsLine[]>
}
