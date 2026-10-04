import { afterEach, describe, expect, it } from 'bun:test'

import { Route as PlaylistRoute } from '@/routes/api/v1/playlists/$appleId'
import { Route as PlaylistCollectionRoute } from '@/routes/api/v1/playlists/$appleId/collections/$collection'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('playlist API', () => {
  it('returns playlist metadata, relationships, and views', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/playlists/pl.example')
      expect(url.searchParams.get('include')).toBe('curator,tracks')
      expect(url.searchParams.get('views')).toBe('featured-artists,more-by-curator')
      expect(url.searchParams.get('extend')).toBe('trackTypes')
      return Response.json({
        data: [
          {
            id: 'pl.example',
            type: 'playlists',
            attributes: {
              name: 'Example Playlist',
              curatorName: 'Example Curator',
              description: { standard: 'Playlist description.' },
              url: 'https://music.apple.com/playlist/example/pl.example',
              isChart: true,
              lastModifiedDate: '2025-01-01',
              playlistType: 'editorial',
              trackTypes: ['songs'],
              artwork: {
                url: 'https://images.test/playlist/{w}x{h}bb.jpg',
                width: 1200,
                height: 1200,
              },
            },
            relationships: {
              curator: {
                data: [
                  { id: 'curator.example', type: 'curators', attributes: { name: 'Curator' } },
                ],
              },
              tracks: {
                data: [{ id: '22222', type: 'songs', attributes: { name: 'Playlist Track' } }],
              },
            },
            views: {
              'featured-artists': {
                data: [{ id: '67890', type: 'artists', attributes: { name: 'Featured Artist' } }],
              },
              'more-by-curator': {
                data: [{ id: 'pl.more', type: 'playlists', attributes: { name: 'More Music' } }],
              },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      PlaylistRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/playlists/pl.example?include=artwork,description,trackTypes,curator,tracks,featuredArtists,moreByCurator',
      ),
      params: { appleId: 'pl.example' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      id: 'pl.example',
      type: 'playlist',
      name: 'Example Playlist',
      curatorName: 'Example Curator',
      description: { standard: 'Playlist description.' },
      trackTypes: ['songs'],
      collections: {
        curator: { items: [{ id: 'curator.example', type: 'curator', name: 'Curator' }] },
        tracks: { items: [{ id: '22222', type: 'song', name: 'Playlist Track' }] },
        featuredArtists: { items: [{ id: '67890', type: 'artist', name: 'Featured Artist' }] },
        moreByCurator: { items: [{ id: 'pl.more', type: 'playlist', name: 'More Music' }] },
      },
    })
    expect(appleRequests).toHaveLength(1)
  })

  it('rejects unsupported playlist include values', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const response = await routeHandler(
      PlaylistRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/playlists/pl.example?include=topSongs'),
      params: { appleId: 'pl.example' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('invalid_request')
    expect(appleRequests).toHaveLength(0)
  })

  it('returns playlist tracks from the Apple relationship endpoint', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/playlists/pl.example/tracks')
      return Response.json({
        data: [
          {
            id: '22222',
            type: 'songs',
            attributes: {
              name: 'Playlist Track',
              artistName: 'Example Artist',
              albumName: 'Example Album',
              durationInMillis: 184000,
            },
          },
        ],
        next: '/v1/catalog/us/playlists/pl.example/tracks?offset=1',
      })
    })

    const response = await routeHandler(
      PlaylistCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/playlists/pl.example/collections/tracks',
      ),
      params: { appleId: 'pl.example', collection: 'tracks' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      type: 'tracks',
      items: [
        {
          id: '22222',
          type: 'song',
          name: 'Playlist Track',
          artistName: 'Example Artist',
          albumName: 'Example Album',
          durationMs: 184000,
        },
      ],
      page: { limit: 20, offset: 0 },
    })
    expect(body.page.next).toContain('offset=1')
    expect(appleRequests).toHaveLength(1)
  })

  it('accepts motionArtwork on a playlist collection page', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/playlists/pl.example/tracks')) {
        return Response.json({
          data: [{ id: 'song.playlist', type: 'songs', attributes: { name: 'Playlist Song' } }],
        })
      }
      return Response.json({ data: [] })
    })

    const response = await routeHandler(
      PlaylistCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/playlists/pl.example/collections/tracks?include=motionArtwork',
      ),
      params: { appleId: 'pl.example', collection: 'tracks' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({ id: 'song.playlist', motionArtwork: null })
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
    expect(appleRequests).toHaveLength(2)
  })
})
