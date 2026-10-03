import { afterEach, describe, expect, it } from 'bun:test'

import { Route as TrackDetailRoute } from '@/routes/api/v1/tracks/$appleId'
import { Route as TrackBatchRoute } from '@/routes/api/v1/tracks/batch'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

const artwork = {
  url: 'https://images.test/track/{w}x{h}bb.jpg',
  width: 1200,
  height: 1200,
}

function song(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'songs',
    attributes: {
      name: 'Example Song',
      artistName: 'Example Artist',
      albumName: 'Example Album',
      durationInMillis: 184000,
      releaseDate: '2024-02-14',
      isrc: 'USRC17607839',
      artwork,
      ...extra,
    },
  }
}

afterEach(restoreFetch)

describe('track detail API', () => {
  it('returns normalized track metadata, related resources, and the raw Apple response on request', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/songs/1082506273')
      expect(url.searchParams.get('include')).toBe('artists,albums')
      return Response.json({
        data: [
          {
            ...song('1082506273', { hasLyrics: true }),
            attributes: {
              ...song('1082506273').attributes,
              url: 'https://music.apple.com/song/example/1082506273',
              hasLyrics: true,
            },
            relationships: {
              artists: {
                data: [{ id: 'artist.1', type: 'artists', attributes: { name: 'Example Artist' } }],
              },
              albums: {
                data: [{ id: 'album.1', type: 'albums', attributes: { name: 'Example Album' } }],
              },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/tracks/1082506273?include=artwork,artists,album,appleCatalog&artworkSize=600',
      ),
      params: { appleId: '1082506273' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.track).toMatchObject({
      id: '1082506273',
      title: 'Example Song',
      artist: 'Example Artist',
      album: 'Example Album',
      durationMs: 184000,
      isrc: 'USRC17607839',
      hasLyrics: true,
      artwork: { width: 600, height: 600 },
      artists: [{ id: 'artist.1', type: 'artist', name: 'Example Artist' }],
      albumResource: { id: 'album.1', type: 'album', name: 'Example Album' },
    })
    expect(body.track).not.toHaveProperty('motionArtwork')
    expect(body.appleCatalog).toMatchObject({
      storefront: 'us',
      response: { data: [{ id: '1082506273', type: 'songs' }] },
    })
    expect(appleRequests).toHaveLength(1)
  })

  it('validates track IDs, includes, formats, and repeated query keys', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const invalidId = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/not-numeric'),
      params: { appleId: 'not-numeric' },
    })
    const invalidInclude = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/123?include=credits'),
      params: { appleId: '123' },
    })
    const invalidFormat = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/123?formats=xml'),
      params: { appleId: '123' },
    })
    const duplicateParameter = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/tracks/123?include=artwork&include=album',
      ),
      params: { appleId: '123' },
    })

    expect(invalidId.status).toBe(400)
    expect(invalidInclude.status).toBe(400)
    expect(invalidFormat.status).toBe(400)
    expect(duplicateParameter.status).toBe(400)
    expect(appleRequests).toHaveLength(0)
  })

  it('returns not found and a generic error for track detail fetch failures', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/songs/404')) return new Response(null, { status: 404 })
      if (url.pathname.endsWith('/songs/503')) return new Response(null, { status: 503 })
      return Response.json({ data: [] })
    })

    const notFound = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/404'),
      params: { appleId: '404' },
    })
    const failure = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/503'),
      params: { appleId: '503' },
    })

    expect(notFound.status).toBe(404)
    expect(failure.status).toBe(500)
  })

  it('opts into album motion artwork when Apple has no song-level video', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/songs/1082506273')) {
        return Response.json({ data: [song('1082506273')] })
      }
      if (url.searchParams.get('ids[songs]') === '1082506273') {
        return Response.json({
          data: [
            {
              ...song('1082506273', {
                url: 'https://music.apple.com/us/album/example-album/234?i=1082506273',
              }),
              relationships: { albums: { data: [{ id: '234', type: 'albums' }] } },
            },
          ],
        })
      }
      if (url.searchParams.get('ids[albums]') === '234') {
        return Response.json({
          data: [
            {
              id: '234',
              type: 'albums',
              attributes: { editorialVideo: appleEditorialVideo },
            },
          ],
        })
      }
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/tracks/1082506273?include=motionArtwork',
      ),
      params: { appleId: '1082506273' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.track.motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
    expect(appleRequests.some((url) => url.searchParams.get('ids[albums]') === '234')).toBe(true)
  })

  it('keeps the track response successful when optional motion metadata cannot be fetched', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/songs/123')) return Response.json({ data: [song('123')] })
      if (url.searchParams.get('extend') === 'editorialVideo')
        return new Response(null, { status: 503 })
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/123?include=motionArtwork'),
      params: { appleId: '123' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.track.motionArtwork).toBeNull()
  })
})

describe('queue batch API', () => {
  it('preserves queue order and applies item artwork size and include overrides', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const ids = url.searchParams.get('ids[songs]')?.split(',') ?? []
      return Response.json({
        data: ids.filter((id) => id !== '404').map((id) => song(id)),
      })
    })

    const response = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: ['artwork', 'identifiers', 'release'],
          artworkSize: 300,
          items: [
            { appleId: '101' },
            { appleId: '404' },
            { appleId: '102', include: ['identifiers'], artworkSize: 600 },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'not_found',
      'matched',
    ])
    expect(body.items.map((item: { index: number }) => item.index)).toEqual([0, 1, 2])
    expect(body.items[0].track).toMatchObject({
      id: '101',
      title: 'Example Song',
      isrc: 'USRC17607839',
      releaseDate: '2024-02-14',
      artwork: { width: 300, height: 300 },
    })
    expect(body.items[0].track).not.toHaveProperty('motionArtwork')
    expect(body.items[2].track).toMatchObject({
      id: '102',
      isrc: 'USRC17607839',
    })
    expect(body.items[2].track).not.toHaveProperty('artwork')
    expect(body.items[2].track).not.toHaveProperty('releaseDate')
    expect(appleRequests).toHaveLength(1)
  })

  it('returns per-item errors when Apple cannot fetch a queue batch and validates request bodies', async () => {
    const appleRequests = mockAppleCatalog(() => new Response(null, { status: 503 }))
    const failure = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ appleId: '100' }] }),
      }),
      params: {},
    })
    const malformed = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      params: {},
    })
    const invalidItem = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ appleId: 'not-numeric' }] }),
      }),
      params: {},
    })
    const failureBody = await failure.json()

    expect(failure.status).toBe(200)
    expect(failureBody.items[0]).toMatchObject({ status: 'error', appleId: '100' })
    expect(malformed.status).toBe(400)
    expect(invalidItem.status).toBe(400)
    expect(appleRequests).toHaveLength(1)
  })

  it('fetches motion artwork only for queue items whose effective include requests it', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const songIds = url.searchParams.get('ids[songs]')?.split(',') ?? []
      const requestedIds =
        url.searchParams.get('extend') === 'editorialVideo'
          ? songIds.filter((id) => id === '101')
          : songIds
      return Response.json({
        data: requestedIds.map((id) =>
          song(
            id,
            url.searchParams.get('extend') === 'editorialVideo'
              ? { editorialVideo: appleEditorialVideo }
              : {},
          ),
        ),
      })
    })

    const response = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: ['artwork', 'motionArtwork'],
          items: [{ appleId: '101' }, { appleId: '102', include: ['artwork'] }],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0].track.motionArtwork).toEqual(expectedMotionArtwork)
    expect(body.items[1].track).not.toHaveProperty('motionArtwork')
    expect(
      appleRequests
        .find((url) => url.searchParams.get('extend') === 'editorialVideo')
        ?.searchParams.get('ids[songs]'),
    ).toBe('101')
  })
})
