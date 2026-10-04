import { afterEach, describe, expect, it } from 'bun:test'

import {
  AlbumIncludeSchema,
  ArtistIncludeSchema,
  PlaylistIncludeSchema,
} from '@/lib/api/v1/catalog-contract'
import { Route as CatalogBatchRoute } from '@/routes/api/v1/catalog/batch'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

afterEach(restoreFetch)

describe('catalog batch API', () => {
  it('accepts all global and per-item include options for every catalog entity', async () => {
    const include = {
      artist: [...ArtistIncludeSchema.options],
      album: [...AlbumIncludeSchema.options],
      playlist: [...PlaylistIncludeSchema.options],
    }
    const appleRequests = mockAppleCatalog((url) => {
      if (url.searchParams.get('extend') === 'editorialVideo') return Response.json({ data: [] })

      const resources = [
        ['artists', 'ids[artists]'],
        ['albums', 'ids[albums]'],
        ['playlists', 'ids[playlists]'],
      ] as const
      const resource = resources.find(([, queryKey]) => url.searchParams.has(queryKey))
      if (!resource) return Response.json({ data: [] })
      const [type, queryKey] = resource
      const ids = url.searchParams.get(queryKey)?.split(',') ?? []

      return Response.json({
        data: ids.map((id) => ({ id, type, attributes: { name: `${type} ${id}` } })),
      })
    })
    const items = [
      { type: 'artist', appleId: 'artist.1' },
      { type: 'artist', appleId: 'artist.2', include: include.artist },
      { type: 'album', appleId: 'album.1' },
      { type: 'album', appleId: 'album.2', include: include.album },
      { type: 'playlist', appleId: 'playlist.1' },
      { type: 'playlist', appleId: 'playlist.2', include: include.playlist },
    ]
    const response = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ include, items }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'matched',
      'matched',
      'matched',
      'matched',
      'matched',
    ])
    expect(
      appleRequests
        .find((url) => url.searchParams.has('ids[artists]'))
        ?.searchParams.get('include'),
    ).toBe('albums,genres,music-videos,playlists,station')
    expect(
      appleRequests.find((url) => url.searchParams.has('ids[artists]'))?.searchParams.get('views'),
    ).toBe(
      'top-songs,latest-release,featured-albums,featured-playlists,featured-music-videos,top-music-videos,full-albums,singles,live-albums,appears-on-albums,compilation-albums,similar-artists',
    )
    expect(
      appleRequests
        .find(
          (url) =>
            url.searchParams.has('ids[albums]') &&
            url.searchParams.get('extend') !== 'editorialVideo',
        )
        ?.searchParams.get('views'),
    ).toBe('appears-on,other-versions,related-albums,related-videos')
    expect(
      appleRequests
        .find(
          (url) =>
            url.searchParams.has('ids[albums]') &&
            url.searchParams.get('extend') !== 'editorialVideo',
        )
        ?.searchParams.get('extend'),
    ).toBe('editorialNotes,artistUrl,audioVariants')
    expect(
      appleRequests
        .find((url) => url.searchParams.has('ids[playlists]'))
        ?.searchParams.get('include'),
    ).toBe('curator,tracks')
    expect(
      appleRequests
        .find((url) => url.searchParams.has('ids[playlists]'))
        ?.searchParams.get('views'),
    ).toBe('featured-artists,more-by-curator')
    expect(
      appleRequests
        .find((url) => url.searchParams.has('ids[playlists]'))
        ?.searchParams.get('extend'),
    ).toBe('trackTypes')
    expect(appleRequests).toHaveLength(4)
  })

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

  it('adds album motion artwork when requested in the batch projection', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const albumId = url.searchParams.get('ids[albums]')
      if (!albumId) return Response.json({ data: [] })
      return Response.json({
        data: [
          {
            id: albumId,
            type: 'albums',
            attributes: {
              name: 'Example Album',
              ...(url.searchParams.get('extend') === 'editorialVideo'
                ? { editorialVideo: appleEditorialVideo }
                : {}),
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      CatalogBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/catalog/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: { album: ['motionArtwork'] },
          items: [{ type: 'album', appleId: '12345' }],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0].status).toBe('matched')
    expect(body.items[0].data.motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
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
