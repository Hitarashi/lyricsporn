import { afterEach, describe, expect, it } from 'bun:test'

import { Route as LookupRoute } from '@/routes/api/v1/lookup'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

const track = {
  id: '1082506273',
  type: 'songs',
  attributes: {
    name: 'Example Song',
    artistName: 'Example Artist',
    albumName: 'Example Album',
    durationInMillis: 184000,
    isrc: 'USRC17607839',
  },
}

afterEach(restoreFetch)

describe('lookup API', () => {
  it('accepts ISRC, Apple ID, Apple link, and title/artist selectors in one batch', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search')) {
        return Response.json({ results: { songs: { data: [track] } } })
      }
      if (url.searchParams.has('filter[isrc]')) {
        expect(url.searchParams.get('filter[isrc]')).toBe('USRC17607839')
        return Response.json({ data: [track] })
      }
      if (url.pathname.endsWith('/songs/1082506273')) return Response.json({ data: [track] })
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      LookupRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: ['track'],
          lookups: [
            {
              lookup: { isrc: 'USRC17607839' },
              include: ['track', 'appleCatalog'],
            },
            { lookup: { appleId: '1082506273' } },
            { lookup: { appleLink: 'https://music.apple.com/us/song/example/1082506273' } },
            { lookup: { title: 'Example Song', artist: 'Example Artist', album: 'Example Album' } },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.map((result: { status: string }) => result.status)).toEqual([
      'matched',
      'matched',
      'matched',
      'matched',
    ])
    expect(body.results.map((result: { index: number }) => result.index)).toEqual([0, 1, 2, 3])
    expect(body.results[0].matches[0].track).toMatchObject({
      id: '1082506273',
      title: 'Example Song',
      artist: 'Example Artist',
      album: 'Example Album',
    })
    expect(body.results[2].lookup).toMatchObject({ appleId: '1082506273' })
    expect(body.results[0].appleCatalog).toMatchObject({
      storefront: 'us',
      response: { data: [{ id: '1082506273', type: 'songs' }] },
    })
    expect(
      appleRequests
        .find((url) => url.searchParams.has('filter[isrc]'))
        ?.searchParams.get('include'),
    ).toBe('albums,artists')
    expect(appleRequests.length).toBeGreaterThanOrEqual(4)
  })

  it('supports GET search with optional album and limits', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/search')
      expect(url.searchParams.get('term')).toBe('Example Song Example Artist Example Album')
      expect(url.searchParams.get('limit')).toBe('2')
      return Response.json({ results: { songs: { data: [track] } } })
    })

    const response = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?title=Example%20Song&artist=Example%20Artist&album=Example%20Album&include=track&limit=2',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({
      index: 0,
      status: 'matched',
      matches: [{ appleTrackId: '1082506273', track: { title: 'Example Song' } }],
    })
    expect(appleRequests).toHaveLength(1)
  })

  it('returns clear validation responses for malformed selectors and request bodies', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [track] }))
    const missingSelector = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/lookup?title=Example%20Song'),
      params: {},
    })
    const duplicateParameter = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?appleId=1082506273&appleId=1082506273',
      ),
      params: {},
    })
    const invalidAppleLink = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?appleLink=https%3A%2F%2Fexample.com%2Fsong%2F1082506273&include=track',
      ),
      params: {},
    })
    const malformedJson = await routeHandler(
      LookupRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      params: {},
    })
    const invalidBody = await routeHandler(
      LookupRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lookups: [] }),
      }),
      params: {},
    })
    const invalidFormats = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?appleId=1082506273&include=track&formats=xml',
      ),
      params: {},
    })
    const invalidInclude = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?appleId=1082506273&include=unknown',
      ),
      params: {},
    })
    const excessiveFormats = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?appleId=1082506273&include=track&formats=json,ttml,elrc,json',
      ),
      params: {},
    })
    const invalidPostLookup = await routeHandler(
      LookupRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lookups: [{ lookup: { appleLink: 'https://example.com/song/1082506273' } }],
        }),
      }),
      params: {},
    })

    expect(missingSelector.status).toBe(400)
    expect(duplicateParameter.status).toBe(400)
    expect((await invalidAppleLink.json()).error.code).toBe('invalid_lookup')
    expect(malformedJson.status).toBe(400)
    expect(invalidBody.status).toBe(400)
    expect(invalidFormats.status).toBe(400)
    expect(invalidInclude.status).toBe(400)
    expect(excessiveFormats.status).toBe(400)
    expect((await invalidPostLookup.json()).error.code).toBe('invalid_lookup')
    expect(appleRequests).toHaveLength(0)
  })

  it('returns an item-level lookup error when Apple search fails', async () => {
    mockAppleCatalog(() => new Response(null, { status: 503 }))
    const response = await routeHandler(
      LookupRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/lookup?title=Example%20Song&artist=Example%20Artist&include=track',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results[0]).toMatchObject({
      status: 'error',
      matches: [],
      error: { code: 'lookup_failed' },
    })
  })
})
