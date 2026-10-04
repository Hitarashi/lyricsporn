import { afterEach, describe, expect, it } from 'bun:test'

import { AlbumIncludeSchema } from '@/lib/api/v1/catalog-contract'
import { Route as AlbumRoute } from '@/routes/api/v1/albums/$appleId'
import { Route as AlbumCollectionRoute } from '@/routes/api/v1/albums/$appleId/collections/$collection'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

afterEach(restoreFetch)

describe('album API', () => {
  it('accepts every album include and maps each option to Apple', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.searchParams.get('extend') === 'editorialVideo') {
        return Response.json({ data: [] })
      }

      expect(url.pathname).toBe('/v1/catalog/us/albums/12345')
      expect(url.searchParams.get('include')).toBe('artists,genres,tracks,record-labels')
      expect(url.searchParams.get('views')).toBe(
        'appears-on,other-versions,related-albums,related-videos',
      )
      expect(url.searchParams.get('extend')).toBe('editorialNotes,artistUrl,audioVariants')
      return Response.json({
        data: [
          {
            id: '12345',
            type: 'albums',
            attributes: {
              name: 'Example Album',
              artistUrl: 'https://music.apple.com/artist/example/67890',
              editorialNotes: { standard: 'Album notes.' },
              audioVariants: ['lossless'],
            },
          },
        ],
      })
    })
    const requestUrl = new URL('https://lyricsporn.test/api/v1/albums/12345')
    requestUrl.searchParams.set('include', AlbumIncludeSchema.options.join(','))

    const response = await routeHandler(
      AlbumRoute,
      'GET',
    )({
      request: new Request(requestUrl),
      params: { appleId: '12345' },
    })
    const body = await response.json()
    const collectionNames = AlbumIncludeSchema.options.filter(
      (name) =>
        name !== 'artwork' &&
        name !== 'editorialNotes' &&
        name !== 'artistUrl' &&
        name !== 'audioVariants' &&
        name !== 'motionArtwork',
    )

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      artistUrl: 'https://music.apple.com/artist/example/67890',
      editorialNotes: { standard: 'Album notes.' },
      audioVariants: ['lossless'],
      motionArtwork: null,
    })
    expect(Object.keys(body.data.collections).sort()).toEqual(collectionNames.sort())
    expect(appleRequests).toHaveLength(2)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })

  it('returns album metadata, extended fields, and requested relationships', async () => {
    mockAppleCatalog(() =>
      Response.json({
        data: [
          {
            id: '12345',
            type: 'albums',
            attributes: {
              name: 'Example Album',
              artistName: 'Example Artist',
              artistUrl: 'https://music.apple.com/artist/example/67890',
              url: 'https://music.apple.com/album/example/12345',
              genreNames: ['Pop'],
              releaseDate: '2025-01-01',
              trackCount: 8,
              contentRating: 'clean',
              copyright: 'Example Records',
              recordLabel: 'Example Records',
              upc: '012345678901',
              audioVariants: ['lossless'],
              isSingle: false,
              isCompilation: false,
              isComplete: true,
              isMasteredForItunes: true,
              editorialNotes: { standard: 'Album notes.' },
              artwork: {
                url: 'https://images.test/album/{w}x{h}bb.jpg',
                width: 1200,
                height: 1200,
              },
            },
            relationships: {
              artists: {
                data: [{ id: '67890', type: 'artists', attributes: { name: 'Example Artist' } }],
              },
              tracks: {
                data: [{ id: '12346', type: 'songs', attributes: { name: 'First Song' } }],
              },
            },
          },
        ],
      }),
    )

    const response = await routeHandler(
      AlbumRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/albums/12345?include=artwork,artistUrl,audioVariants,editorialNotes,artists,tracks',
      ),
      params: { appleId: '12345' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      id: '12345',
      type: 'album',
      name: 'Example Album',
      artistName: 'Example Artist',
      artistUrl: 'https://music.apple.com/artist/example/67890',
      audioVariants: ['lossless'],
      trackCount: 8,
      editorialNotes: { standard: 'Album notes.' },
      collections: {
        artists: { items: [{ id: '67890', type: 'artist', name: 'Example Artist' }] },
        tracks: { items: [{ id: '12346', type: 'song', name: 'First Song' }] },
      },
    })
  })

  it('returns not found for missing albums and a generic error for Apple failures', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/albums/404')) return new Response(null, { status: 404 })
      if (url.pathname.endsWith('/albums/503')) return new Response(null, { status: 503 })
      return Response.json({ data: [] })
    })

    const notFound = await routeHandler(
      AlbumRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/albums/404'),
      params: { appleId: '404' },
    })
    const failure = await routeHandler(
      AlbumRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/albums/503'),
      params: { appleId: '503' },
    })

    expect(notFound.status).toBe(404)
    expect((await notFound.json()).error.code).toBe('not_found')
    expect(failure.status).toBe(500)
    expect((await failure.json()).error.code).toBe('internal_error')
    expect(appleRequests).toHaveLength(2)
  })

  it('returns album tracks with the requested page and artwork dimensions', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/albums/12345/tracks')
      return Response.json({
        data: [
          {
            id: '12346',
            type: 'songs',
            attributes: {
              name: 'First Song',
              artistName: 'Example Artist',
              albumName: 'Example Album',
              artwork: {
                url: 'https://images.test/song/{w}x{h}bb.jpg',
                width: 1200,
                height: 1200,
              },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      AlbumCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/albums/12345/collections/tracks?limit=5&artworkSize=600',
      ),
      params: { appleId: '12345', collection: 'tracks' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      type: 'tracks',
      items: [
        {
          id: '12346',
          type: 'song',
          name: 'First Song',
          artistName: 'Example Artist',
          artwork: {
            url: 'https://images.test/song/600x600bb.jpg',
            width: 600,
            height: 600,
          },
        },
      ],
      page: { limit: 5, offset: 0 },
    })
    expect(appleRequests[0]?.searchParams.get('limit')).toBe('5')
    expect(appleRequests).toHaveLength(1)
  })

  it('returns album motion artwork only when requested', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/albums/12345')) {
        return Response.json({
          data: [{ id: '12345', type: 'albums', attributes: { name: 'Example Album' } }],
        })
      }
      if (url.searchParams.get('ids[albums]') === '12345') {
        return Response.json({
          data: [
            {
              id: '12345',
              type: 'albums',
              attributes: { name: 'Example Album', editorialVideo: appleEditorialVideo },
            },
          ],
        })
      }
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      AlbumRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/albums/12345?include=motionArtwork'),
      params: { appleId: '12345' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })

  it('adds requested motion artwork to song items in a collection page', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/albums/12345/tracks')) {
        return Response.json({
          data: [{ id: '12346', type: 'songs', attributes: { name: 'Song' } }],
        })
      }
      if (url.searchParams.get('ids[songs]') === '12346') {
        return Response.json({
          data: [
            {
              id: '12346',
              type: 'songs',
              attributes: { name: 'Song', editorialVideo: appleEditorialVideo },
            },
          ],
        })
      }
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      AlbumCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/albums/12345/collections/tracks?include=motionArtwork',
      ),
      params: { appleId: '12345', collection: 'tracks' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0].motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })
})
