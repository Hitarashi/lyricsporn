import type {
  EvaluatedCandidate,
  LyricsCandidate,
  LyricsLine,
  LyricsResult,
} from '@/lib/lyrics/domain/types'

import { parseLyrics } from '@/lib/lyrics/parser'

interface IndexedCandidate {
  candidate: LyricsCandidate
  sourceIndex: number
  candidateIndex: number
}

function scoreCandidate(candidate: LyricsCandidate): number {
  const parsed = parseLyrics(candidate.document)
  const cleanText = parsed.plainText.trim()
  if (cleanText.length < 10 || parsed.lines.length < 2) return 0

  const tierScore = parsed.syncLevel === 'word' ? 1000 : parsed.syncLevel === 'line' ? 500 : 100
  return tierScore + (candidate.weight ?? 0) + (candidate.metadataScore ?? 0)
}

export function rankCandidates(candidates: IndexedCandidate[]): {
  candidates: EvaluatedCandidate[]
  winner: EvaluatedCandidate | null
} {
  const evaluated = candidates.map(({ candidate, sourceIndex, candidateIndex }) => ({
    candidate,
    sourceIndex,
    candidateIndex,
    score: scoreCandidate(candidate),
  }))

  const winner =
    evaluated
      .filter(({ score }) => score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score
        if (left.sourceIndex !== right.sourceIndex) return left.sourceIndex - right.sourceIndex
        return left.candidateIndex - right.candidateIndex
      })[0] ?? null

  return { candidates: evaluated, winner }
}

export function candidateToResult(
  candidate: LyricsCandidate,
  durationMs: number,
  mainArtist?: string | null,
): LyricsResult {
  const parsed = parseLyrics(candidate.document, { durationMs, mainArtist })
  return {
    ...parsed,
    provider: candidate.provider,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    attribution: candidate.attribution,
    instrumental: candidate.instrumental,
  }
}

export function createFallbackLyrics(
  lookup: { title: string; artistString: string },
  durationMs = 0,
): LyricsResult {
  const title = lookup.title.trim() || 'Instrumental'
  const artist = lookup.artistString.trim()
  const text = artist ? `${title}\n${artist}` : title
  const lines: LyricsLine[] = [
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
