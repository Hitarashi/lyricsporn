import { afterEach, describe, expect, it } from 'bun:test'

import { Route as ArtistRoute } from '@/routes/api/v1/artists/$appleId'
import { Route as ArtistCollectionRoute } from '@/routes/api/v1/artists/$appleId/collections/$collection'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('artist API', () => {
  it('returns artist details and a requested view', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/artists/28721078')
      expect(url.searchParams.get('views')).toBe('top-songs')
      return Response.json({
        data: [
          {
            id: '28721078',
            type: 'artists',
            attributes: { name: 'Sia', genreNames: ['Pop'] },
            views: {
              'top-songs': {
                data: [
                  {
                    id: '1082506273',
                    type: 'songs',
                    attributes: { name: 'Chandelier', artistName: 'Sia' },
                  },
                ],
              },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      ArtistRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/28721078?include=topSongs'),
      params: { appleId: '28721078' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=600')
    expect(body.data.id).toBe('28721078')
    expect(body.data.name).toBe('Sia')
    expect(body.data.collections.topSongs.items[0]).toMatchObject({
      id: '1082506273',
      name: 'Chandelier',
      type: 'song',
    })
    expect(appleRequests).toHaveLength(1)
  })

  it('rejects invalid artist IDs, include values, and duplicate query parameters', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))

    const invalidInclude = await routeHandler(
      ArtistRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/28721078?include=madeUp'),
      params: { appleId: '28721078' },
    })
    const duplicateInclude = await routeHandler(
      ArtistRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/artists/28721078?include=topSongs&include=albums',
      ),
      params: { appleId: '28721078' },
    })
    const invalidId = await routeHandler(
      ArtistRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/invalid%20id'),
      params: { appleId: 'invalid id' },
    })
    const invalidLimit = await routeHandler(
      ArtistRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/28721078?limit=0'),
      params: { appleId: '28721078' },
    })

    expect(invalidInclude.status).toBe(400)
    expect(duplicateInclude.status).toBe(400)
    expect(invalidId.status).toBe(400)
    expect(invalidLimit.status).toBe(400)
    expect(appleRequests).toHaveLength(0)
  })

  it('returns a paginated artist view using Apple collection metadata', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/catalog/us/artists/28721078/view/top-songs')
      expect(url.searchParams.get('limit')).toBe('2')
      expect(url.searchParams.get('offset')).toBe('2')
      expect(url.searchParams.get('with')).toBe('attributes')
      return Response.json({
        data: [
          { id: '3', type: 'songs', attributes: { name: 'Song Three' } },
          { id: '4', type: 'songs', attributes: { name: 'Song Four' } },
        ],
        next: '/v1/catalog/us/artists/28721078/view/top-songs?offset=4',
      })
    })

    const response = await routeHandler(
      ArtistCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/artists/28721078/collections/topSongs?limit=2&offset=2',
      ),
      params: { appleId: '28721078', collection: 'topSongs' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      type: 'topSongs',
      items: [
        { id: '3', type: 'song', name: 'Song Three' },
        { id: '4', type: 'song', name: 'Song Four' },
      ],
      page: { limit: 2, offset: 2 },
    })
    expect(body.page.next).toContain('offset=4')
    expect(appleRequests).toHaveLength(1)
  })

  it('returns an empty view when Apple reports no related resources for an existing artist', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/view/top-songs')) {
        return Response.json(
          { errors: [{ title: 'Invalid Path Value', detail: 'No view found matching top-songs' }] },
          { status: 404 },
        )
      }
      return Response.json({
        data: [{ id: '28721078', type: 'artists', attributes: { name: 'Sia' } }],
      })
    })

    const response = await routeHandler(
      ArtistCollectionRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/28721078/collections/topSongs'),
      params: { appleId: '28721078', collection: 'topSongs' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ type: 'topSongs', items: [] })
    expect(appleRequests).toHaveLength(2)
  })

  it('returns not found when an unavailable view belongs to a missing artist', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/view/top-songs')) {
        return Response.json(
          { errors: [{ title: 'Invalid Path Value', detail: 'No view found matching top-songs' }] },
          { status: 404 },
        )
      }
      return new Response(null, { status: 404 })
    })

    const response = await routeHandler(
      ArtistCollectionRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/404/collections/topSongs'),
      params: { appleId: '404', collection: 'topSongs' },
    })

    expect(response.status).toBe(404)
    expect((await response.json()).error.code).toBe('not_found')
  })

  it('rejects unsupported artist collections before requesting Apple data', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const response = await routeHandler(
      ArtistCollectionRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/artists/28721078/collections/nope'),
      params: { appleId: '28721078', collection: 'nope' },
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('invalid_request')
    expect(appleRequests).toHaveLength(0)
  })
})
