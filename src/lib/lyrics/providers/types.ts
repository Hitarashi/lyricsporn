import type { LyricsHttpPort } from '../http'
import type { LyricsCandidate, LyricsLookup } from '../types'

export interface LyricsSource {
  readonly id: string
  readonly name: string
  lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]>
}
