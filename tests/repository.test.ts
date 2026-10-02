import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/types'

import { describe, expect, it } from 'bun:test'

import { LyricsRepository, scoreCandidate } from '@/lib/lyrics/repository'
import { metadataScore } from '@/lib/lyrics/utils/string'

describe('LyricsRepository and Scoring', () => {
  const dummyLookup: LyricsLookup = {
    title: 'Test Song',
    artistString: 'Test Artist',
    durationSeconds: 180,
  }

  it('scores word synced candidates with 1000 tier score + weight + metadataScore', async () => {
    const candidate: LyricsCandidate = {
      text: '[00:01.00]<00:01.00>Word <00:02.00>one\n[00:03.00]<00:03.00>Word <00:04.00>two',
      provider: 'TestProvider',
      sourceId: 'test:1',
      weight: 15,
      metadataScore: 80,
    }

    const mockSource = {
      id: 'mock',
      name: 'Mock',
      lookup: async () => [candidate],
    }

    const repo = new LyricsRepository({ sources: [mockSource] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner).toBeDefined()
    expect(detailed.winner?.score).toBe(1095)
  })

  it('scores line synced candidates with 500 tier score + weight', async () => {
    const candidate: LyricsCandidate = {
      text: '[00:01.00]Line one text\n[00:03.00]Line two text',
      provider: 'TestProvider',
      sourceId: 'test:2',
      weight: 10,
    }

    const mockSource = {
      id: 'mock',
      name: 'Mock',
      lookup: async () => [candidate],
    }

    const repo = new LyricsRepository({ sources: [mockSource] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner).toBeDefined()
    expect(detailed.winner?.score).toBe(510)
  })

  it('scores plain candidates with 100 tier score + weight', async () => {
    const candidate: LyricsCandidate = {
      text: 'Line one text without time\nLine two text without time',
      provider: 'TestProvider',
      sourceId: 'test:3',
      weight: 5,
    }

    const mockSource = {
      id: 'mock',
      name: 'Mock',
      lookup: async () => [candidate],
    }

    const repo = new LyricsRepository({ sources: [mockSource] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner).toBeDefined()
    expect(detailed.winner?.score).toBe(105)
  })

  it('scores candidates with less than 10 characters or less than 2 lines as 0', async () => {
    const shortCandidate: LyricsCandidate = {
      text: 'Too short',
      provider: 'TestProvider',
      sourceId: 'test:short',
    }

    expect(scoreCandidate(shortCandidate)).toBe(0)

    const mockSource = {
      id: 'mock',
      name: 'Mock',
      lookup: async () => [shortCandidate],
    }

    const repo = new LyricsRepository({ sources: [mockSource] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner).toBeNull()
  })

  it('breaks ties using earlier provider index in repository', async () => {
    const text = '[00:01.00]Line one\n[00:03.00]Line two'
    const source1 = {
      id: 'source1',
      name: 'Source 1',
      lookup: async () => [
        {
          text,
          provider: 'Provider 1',
          sourceId: 's1',
          weight: 0,
        },
      ],
    }
    const source2 = {
      id: 'source2',
      name: 'Source 2',
      lookup: async () => [
        {
          text,
          provider: 'Provider 2',
          sourceId: 's2',
          weight: 0,
        },
      ],
    }

    const repo = new LyricsRepository({ sources: [source1, source2] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.winner?.candidate.provider).toBe('Provider 1')
  })

  it('provides fallback lyrics when no provider returns lyrics or score is 0', async () => {
    const repo = new LyricsRepository({ sources: [] })
    const result = await repo.lookup(dummyLookup, { bypassCache: true })

    expect(result.provider).toBe('Fallback')
    expect(result.syncLevel).toBe('plain')
    expect(result.plainText).toContain('Test Song')
    expect(result.plainText).toContain('Test Artist')
  })

  it('handles provider throwing error gracefully without failing other sources', async () => {
    const failingSource = {
      id: 'fail',
      name: 'Failing Source',
      lookup: async () => {
        throw new Error('Network timeout or crash')
      },
    }
    const goodSource = {
      id: 'good',
      name: 'Good Source',
      lookup: async () => [
        {
          text: '[00:01.00]Line 1\n[00:02.00]Line 2',
          provider: 'Good Provider',
          sourceId: 'g1',
        },
      ],
    }

    const repo = new LyricsRepository({ sources: [failingSource, goodSource] })
    const detailed = await repo.lookupDetailed(dummyLookup, { bypassCache: true })

    expect(detailed.result.provider).toBe('Good Provider')
    expect(detailed.errors.fail).toBe('Network timeout or crash')
    expect(detailed.winner?.candidate.provider).toBe('Good Provider')
  })

  it('evaluates metadataScore with title, artist, album, and duration tolerance', () => {
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
    expect(exact).toBeDefined()
    if (exact !== null) {
      expect(exact).toBeGreaterThan(200)
    }

    const tooFarDuration = metadataScore(lookup, 'Cheap Thrills', 'Sia', 'This Is Acting', 230)
    expect(tooFarDuration).toBeNull()

    const wrongTitle = metadataScore(lookup, 'Chandelier', 'Sia')
    expect(wrongTitle).toBeNull()
  })

  it('caches results and returns cached entry on subsequent calls', async () => {
    let callCount = 0
    const countingSource = {
      id: 'count',
      name: 'Counting Source',
      lookup: async () => {
        callCount++
        return [
          {
            text: '[00:01.00]Count line 1\n[00:02.00]Count line 2',
            provider: 'Counting Provider',
            sourceId: 'cnt',
          },
        ]
      },
    }

    const repo = new LyricsRepository({ sources: [countingSource] })

    await repo.lookup(dummyLookup)
    expect(callCount).toBe(1)

    await repo.lookup(dummyLookup)
    expect(callCount).toBe(1)

    await repo.lookup(dummyLookup, { bypassCache: true })
    expect(callCount).toBe(2)
  })
})
