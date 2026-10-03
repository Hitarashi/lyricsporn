import { afterEach, describe, expect, it } from 'bun:test'

import { Route as CatalogBatchRoute } from '@/routes/api/v1/catalog/batch'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('catalog batch API', () => {
  it('returns mixed artist, album, and playlist projections in request order', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const artistId = url.searchParams.get('ids[artists]')
      if (artistId) {
        return Response.json({
          data: [
            {
              id: artistId,
              type: 'artists',
              attributes: { name: 'Example Artist' },
              views: {
                'top-songs': {
                  data: [{ id: 'song.artist', type: 'songs', attributes: { name: 'Artist Song' } }],
                },
              },
            },
          ],
        })
      }

      const albumId = url.searchParams.get('ids[albums]')
      if (albumId) {
        return Response.json({
          data: [
            {
              id: albumId,
              type: 'albums',
              attributes: { name: 'Example Album', artistName: 'Example Artist' },
              relationships: {
                tracks: {
                  data: [{ id: 'song.album', type: 'songs', attributes: { name: 'Album Song' } }],
                },
              },
            },
          ],
        })
      }

      const playlistId = url.searchParams.get('ids[playlists]')
      if (playlistId) {
        return Response.json({
          data: [
            {
              id: playlistId,
              type: 'playlists',
              attributes: { name: 'Example Playlist' },
              relationships: {
                tracks: {
                  data: [
                    { id: 'song.playlist', type: 'songs', attributes: { name: 'Playlist Song' } },
                  ],
                },
              },
            },
          ],
        })
      }

      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: {
            artist: ['topSongs'],
            album: ['tracks'],
            playlist: ['tracks'],
          },
          items: [
            { type: 'artist', appleId: '28721078' },
            { type: 'album', appleId: '12345' },
            { type: 'playlist', appleId: 'pl.example' },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'matched',
      'matched',
    ])
    expect(body.items.map((item: { index: number }) => item.index)).toEqual([0, 1, 2])
    expect(body.items[0].data.collections.topSongs.items[0].name).toBe('Artist Song')
    expect(body.items[1].data.collections.tracks.items[0].name).toBe('Album Song')
    expect(body.items[2].data.collections.tracks.items[0].name).toBe('Playlist Song')
    expect(appleRequests).toHaveLength(3)
  })

  it('returns per-item not-found and error statuses for catalog batch lookups', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.searchParams.get('ids[artists]') === '28721078,404') {
        return Response.json({
          data: [
            {
              id: '28721078',
              type: 'artists',
              attributes: { name: 'Sia' },
            },
          ],
        })
      }
      return new Response(null, { status: 503 })
    })

    const successResponse = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            { type: 'artist', appleId: '28721078' },
            { type: 'artist', appleId: '404' },
          ],
        }),
      }),
      params: {},
    })
    const successBody = await successResponse.json()
    const errorResponse = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ type: 'artist', appleId: '500' }] }),
      }),
      params: {},
    })
    const errorBody = await errorResponse.json()

    expect(successBody.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'not_found',
    ])
    expect(errorResponse.status).toBe(200)
    expect(errorBody.items[0]).toMatchObject({ status: 'error', appleId: '500' })
    expect(appleRequests).toHaveLength(2)
  })

  it('rejects malformed JSON and invalid catalog batch items', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const invalidJson = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      params: {},
    })
    const invalidBody = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ type: 'artist', appleId: 'bad id' }] }),
      }),
      params: {},
    })

    expect(invalidJson.status).toBe(400)
    expect(invalidBody.status).toBe(400)
    expect(appleRequests).toHaveLength(0)
  })
})
