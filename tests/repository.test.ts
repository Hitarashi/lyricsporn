import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/domain/types'

import { describe, expect, it } from 'bun:test'

import { LyricsRepository } from '@/lib/lyrics/application/repository'
import { metadataScore } from '@/lib/lyrics/domain/matching'

const dummyLookup: LyricsLookup = {
  title: 'Test Song',
  artistString: 'Test Artist',
  durationSeconds: 180,
}

const unusedHttp: LyricsHttpPort = {
  async get() {
    return null
  },
  async postJson() {
    return null
  },
}

function makeRepository(sources: LyricsSource[], options: { now?: () => number } = {}) {
  return new LyricsRepository({ sources, http: unusedHttp, ...options })
}

function source(
  id: string,
  candidates: LyricsCandidate[] | (() => LyricsCandidate[]),
): LyricsSource {
  return {
    id,
    name: id,
    async lookup() {
      return typeof candidates === 'function' ? candidates() : candidates
    },
  }
}

describe('LyricsRepository', () => {
  it('ranks word synced candidates above line and plain lyrics', async () => {
    const candidates: LyricsCandidate[] = [
      {
        document: {
          format: 'elrc',
          content: '[00:01.00]<00:01.00>Word <00:02.00>one\n[00:03.00]<00:03.00>Word <00:04.00>two',
        },
        provider: 'Word provider',
        sourceId: 'word',
        weight: 15,
        metadataScore: 80,
      },
      {
        document: { format: 'lrc', content: '[00:01.00]Line one text\n[00:03.00]Line two text' },
        provider: 'Line provider',
        sourceId: 'line',
        weight: 10,
      },
      {
        document: {
          format: 'plain',
          content: 'Line one text without time\nLine two text without time',
        },
        provider: 'Plain provider',
        sourceId: 'plain',
        weight: 5,
      },
    ]
    const repository = makeRepository([source('mock', candidates)])

    const detailed = await repository.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner?.candidate.provider).toBe('Word provider')
    expect(detailed.winner?.score).toBe(1095)
    expect(detailed.candidates.map(({ score }) => score)).toEqual([1095, 510, 105])
  })

  it('rejects candidates with fewer than 10 lyric characters or fewer than two lines', async () => {
    const repository = makeRepository([
      source('short', [
        {
          document: { format: 'plain', content: 'Too short' },
          provider: 'Short provider',
          sourceId: 'short',
        },
      ]),
    ])

    const detailed = await repository.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.candidates[0]?.score).toBe(0)
    expect(detailed.winner).toBeNull()
  })

  it('breaks equal scores by source registration order', async () => {
    const document = { format: 'lrc' as const, content: '[00:01.00]Line one\n[00:03.00]Line two' }
    const repository = makeRepository([
      source('first', [{ document, provider: 'Provider 1', sourceId: 's1' }]),
      source('second', [{ document, provider: 'Provider 2', sourceId: 's2' }]),
    ])

    const detailed = await repository.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner?.candidate.provider).toBe('Provider 1')
  })

  it('returns fallback lyrics when no source returns a valid candidate', async () => {
    const repository = makeRepository([])
    const result = await repository.lookup(dummyLookup, { bypassCache: true })

    expect(result.provider).toBe('Fallback')
    expect(result.syncLevel).toBe('plain')
    expect(result.plainText).toContain('Test Song')
    expect(result.plainText).toContain('Test Artist')
  })

  it('continues when a source throws and reports the error', async () => {
    const repository = makeRepository([
      {
        id: 'fail',
        name: 'Failing source',
        async lookup() {
          throw new Error('Network timeout or crash')
        },
      },
      source('good', [
        {
          document: { format: 'lrc', content: '[00:01.00]Line one\n[00:02.00]Line two' },
          provider: 'Good provider',
          sourceId: 'good',
        },
      ]),
    ])

    const detailed = await repository.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.result.provider).toBe('Good provider')
    expect(detailed.errors.fail).toBe('Network timeout or crash')
    expect(detailed.winner?.candidate.provider).toBe('Good provider')
  })

  it('validates metadata matches before candidates are considered', () => {
    const lookup: LyricsLookup = {
      title: 'Cheap Thrills',
      artistString: 'Sia feat. Sean Paul',
      album: 'This Is Acting',
      durationSeconds: 211,
    }

    const exact = metadataScore(
      lookup,
      'Cheap Thrills',
      'Sia feat. Sean Paul',
      'This Is Acting',
      211,
    )
    expect(exact).toBeGreaterThan(200)
    expect(metadataScore(lookup, 'Cheap Thrills', 'Sia', 'This Is Acting', 230)).toBeNull()
    expect(metadataScore(lookup, 'Chandelier', 'Sia')).toBeNull()
  })

  it('caches results and supports bypassing the cache', async () => {
    let callCount = 0
    const repository = makeRepository([
      source('count', () => {
        callCount++
        return [
          {
            document: {
              format: 'lrc',
              content: '[00:01.00]Count line one\n[00:02.00]Count line two',
            },
            provider: 'Counting provider',
            sourceId: 'count',
          },
        ]
      }),
    ])

    await repository.lookup(dummyLookup)
    expect(callCount).toBe(1)

    await repository.lookup(dummyLookup)
    expect(callCount).toBe(1)

    await repository.lookup(dummyLookup, { bypassCache: true })
    expect(callCount).toBe(2)
  })
})
